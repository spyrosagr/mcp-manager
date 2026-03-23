import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createTwoFilesPatch } from 'diff';
import type { InventoryManager } from '../inventory/inventory.js';
import type { ClientType, McpServer } from '../inventory/types.js';
import { ALL_CLIENTS } from '../inventory/types.js';
import type { ExportOptions, ExportResult, ExportPreview, WriteResult } from './types.js';
import { getClientConfigPath } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

import { generateClaudeDesktopConfig } from './clients/claude-desktop.js';
import { generateCursorConfig } from './clients/cursor.js';
import { generateVSCodeConfig } from './clients/vscode.js';
import { generateClaudeCodeConfig } from './clients/claude-code.js';
import { generateClineConfig } from './clients/cline.js';
import { generateWindsurfConfig } from './clients/windsurf.js';
import { generateContinueConfig } from './clients/continue.js';
import { generateZedConfig } from './clients/zed.js';

type ConfigGenerator = (servers: McpServer[]) => Record<string, unknown>;

const CLIENT_GENERATORS: Record<ClientType, ConfigGenerator> = {
  'claude-desktop': generateClaudeDesktopConfig,
  'cursor': generateCursorConfig,
  'vscode': generateVSCodeConfig,
  'claude-code': generateClaudeCodeConfig,
  'cline': generateClineConfig,
  'windsurf': generateWindsurfConfig,
  'continue': generateContinueConfig,
  'zed': generateZedConfig,
};

// Which JSON key contains the MCP servers for each client
const CLIENT_MCP_KEYS: Record<ClientType, string[]> = {
  'claude-desktop': ['mcpServers'],
  'cursor': ['mcpServers'],
  'vscode': ['mcp'],
  'claude-code': ['mcpServers'],
  'cline': ['mcpServers'],
  'windsurf': ['mcpServers'],
  'continue': ['mcpServers'],
  'zed': ['context_servers'],
};

export class ConfigExporter {
  constructor(private inventory: InventoryManager) {}

  export(client: ClientType, options?: ExportOptions): ExportResult {
    const servers = this.inventory.getServersForClient(client, options?.profileId);
    const filteredServers = options?.onlyEnabled !== false
      ? servers.filter((s) => s.enabled)
      : servers;

    const generator = CLIENT_GENERATORS[client];
    const generated = generator(filteredServers);

    const filePath = getClientConfigPath(client);
    const merge = options?.merge !== false;

    let finalConfig: Record<string, unknown>;
    if (merge) {
      finalConfig = this.mergeWithExisting(filePath, generated, client);
    } else {
      finalConfig = generated;
    }

    const configJson = JSON.stringify(finalConfig, null, 2);
    const hash = crypto.createHash('sha256').update(configJson).digest('hex');

    return {
      client,
      configJson,
      filePath,
      serverCount: filteredServers.length,
      hash,
    };
  }

  exportAll(options?: ExportOptions): Map<ClientType, ExportResult> {
    const results = new Map<ClientType, ExportResult>();
    for (const client of ALL_CLIENTS) {
      results.set(client, this.export(client, options));
    }
    return results;
  }

  preview(client: ClientType, options?: ExportOptions): ExportPreview {
    const result = this.export(client, options);
    let currentContent: string | null = null;

    try {
      currentContent = fs.readFileSync(result.filePath, 'utf-8');
    } catch {
      // File doesn't exist
    }

    const diff = createTwoFilesPatch(
      'current',
      'generated',
      currentContent || '{}',
      result.configJson,
      undefined,
      undefined,
      { context: 3 },
    );

    return {
      client,
      currentContent,
      generatedContent: result.configJson,
      diff,
      hasChanges: currentContent !== result.configJson,
    };
  }

  write(client: ClientType, result: ExportResult, options?: ExportOptions): WriteResult {
    const backup = options?.backup !== false;
    let backupPath: string | null = null;

    try {
      // Create directory if needed
      const dir = path.dirname(result.filePath);
      fs.mkdirSync(dir, { recursive: true });

      // Backup existing file
      if (backup) {
        try {
          fs.accessSync(result.filePath);
          backupPath = result.filePath + '.bak';
          fs.copyFileSync(result.filePath, backupPath);
          logger.info('Backup created', { path: backupPath });
        } catch {
          // No existing file to backup
        }
      }

      // Write the new config
      fs.writeFileSync(result.filePath, result.configJson, 'utf-8');
      logger.info('Config written', { client, path: result.filePath });

      return {
        client,
        filePath: result.filePath,
        backupPath,
        written: true,
      };
    } catch (err) {
      return {
        client,
        filePath: result.filePath,
        backupPath,
        written: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  writeAll(
    results: Map<ClientType, ExportResult>,
    options?: ExportOptions,
  ): Map<ClientType, WriteResult> {
    const writeResults = new Map<ClientType, WriteResult>();
    for (const [client, result] of results) {
      writeResults.set(client, this.write(client, result, options));
    }
    return writeResults;
  }

  private mergeWithExisting(
    filePath: string,
    generated: Record<string, unknown>,
    client: ClientType,
  ): Record<string, unknown> {
    let existing: Record<string, unknown>;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      existing = JSON.parse(content);
      if (typeof existing !== 'object' || existing === null) {
        existing = {};
      }
    } catch {
      return generated;
    }

    // Deep merge: replace only the MCP-specific keys, preserve everything else
    const mcpKeys = CLIENT_MCP_KEYS[client];
    if (!mcpKeys) return generated;

    const merged = { ...existing };
    for (const key of mcpKeys) {
      const genValue = generated[key];
      if (genValue !== undefined) {
        merged[key] = genValue;
      }
    }

    return merged;
  }
}
