import * as fs from 'node:fs';
import type { ClientType, McpServer, ImportResult, CreateServerInput, ServerClient } from './types.js';
import type { InventoryManager } from './inventory.js';
import { getClientConfigPath } from '../utils/paths.js';
import { ConfigFileError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function importFromClient(
  client: ClientType,
  inventory: InventoryManager,
): ImportResult {
  const configPath = getClientConfigPath(client);
  return importFromFile(configPath, client, inventory);
}

export function importFromFile(
  filePath: string,
  client: ClientType,
  inventory: InventoryManager,
): ImportResult {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new ConfigFileError(filePath, 'File not found or not readable');
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new ConfigFileError(filePath, 'Invalid JSON');
  }

  if (typeof json !== 'object' || json === null) {
    throw new ConfigFileError(filePath, 'Config is not a JSON object');
  }

  const servers = extractServers(json as Record<string, unknown>, client);
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    servers: [],
  };

  for (const [name, serverConfig] of Object.entries(servers)) {
    try {
      // Check if already exists
      const existing = inventory.getByName(name);
      if (existing) {
        result.skipped++;
        continue;
      }

      const input = parseServerEntry(name, serverConfig, client);
      const server = inventory.create(input);
      result.servers.push(server);
      result.imported++;
    } catch (err) {
      result.errors.push({
        name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

function extractServers(
  json: Record<string, unknown>,
  client: ClientType,
): Record<string, Record<string, unknown>> {
  switch (client) {
    case 'vscode': {
      // VS Code: { mcp: { servers: { ... } } }
      const mcp = json['mcp'];
      if (typeof mcp === 'object' && mcp !== null) {
        const servers = (mcp as Record<string, unknown>)['servers'];
        if (typeof servers === 'object' && servers !== null) {
          return servers as Record<string, Record<string, unknown>>;
        }
      }
      return {};
    }
    case 'zed': {
      // Zed: { context_servers: { ... } }
      const contextServers = json['context_servers'];
      if (typeof contextServers === 'object' && contextServers !== null) {
        return contextServers as Record<string, Record<string, unknown>>;
      }
      return {};
    }
    default: {
      // Claude Desktop, Cursor, Claude Code, Cline, Windsurf, Continue: { mcpServers: { ... } }
      const mcpServers = json['mcpServers'];
      if (typeof mcpServers === 'object' && mcpServers !== null) {
        return mcpServers as Record<string, Record<string, unknown>>;
      }
      return {};
    }
  }
}

function parseServerEntry(
  name: string,
  config: Record<string, unknown>,
  client: ClientType,
): CreateServerInput {
  const hasCommand = typeof config['command'] === 'string';
  const hasUrl = typeof config['url'] === 'string';

  let transport: 'stdio' | 'sse' | 'streamable-http';
  if (hasCommand) {
    transport = 'stdio';
  } else if (hasUrl) {
    // Check for type field (VS Code style)
    const typeField = config['type'];
    if (typeField === 'streamable-http') {
      transport = 'streamable-http';
    } else {
      transport = 'sse';
    }
  } else {
    throw new Error('Server entry has neither command nor url');
  }

  // Parse environment variables
  let envVars: Record<string, string> | undefined;
  if (config['env'] && typeof config['env'] === 'object') {
    envVars = {};
    for (const [key, value] of Object.entries(config['env'] as Record<string, unknown>)) {
      envVars[key] = String(value);
    }
  }

  // Parse headers
  let headers: Record<string, string> | undefined;
  if (config['headers'] && typeof config['headers'] === 'object') {
    headers = {};
    for (const [key, value] of Object.entries(config['headers'] as Record<string, unknown>)) {
      headers[key] = String(value);
    }
  }

  // Parse args
  let args: string[] | undefined;
  if (Array.isArray(config['args'])) {
    args = config['args'].map(String);
  }

  const clients: ServerClient[] = [{ client, enabled: true }];

  return {
    name,
    transport,
    command: hasCommand ? String(config['command']) : undefined,
    args,
    cwd: typeof config['cwd'] === 'string' ? config['cwd'] : undefined,
    url: hasUrl ? String(config['url']) : undefined,
    headers,
    envVars,
    source: 'imported',
    sourceClient: client,
    enabled: true,
    clients,
  };
}
