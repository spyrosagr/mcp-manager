import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { InventoryManager } from '../src/inventory/inventory.js';
import { ConfigExporter } from '../src/exporter/exporter.js';
import { runMigrations } from '../src/db/migrate.js';
import type { CreateServerInput } from '../src/inventory/types.js';
import { generateVSCodeConfig } from '../src/exporter/clients/vscode.js';
import { generateZedConfig } from '../src/exporter/clients/zed.js';
import { generateClaudeDesktopConfig } from '../src/exporter/clients/claude-desktop.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTestServer(name: string): CreateServerInput {
  return {
    name,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', `@test/${name}`],
    envVars: { API_KEY: 'test-key' },
    source: 'manual',
    enabled: true,
    clients: [
      { client: 'claude-desktop', enabled: true },
      { client: 'cursor', enabled: true },
      { client: 'vscode', enabled: true },
    ],
  };
}

describe('Client Config Generators', () => {
  const testServers = [
    {
      id: '1', name: 'github', transport: 'stdio' as const,
      command: 'npx', args: ['-y', '@mcp/github'],
      envVars: { TOKEN: 'test' },
      source: 'manual' as const, enabled: true,
      clients: [{ client: 'claude-desktop' as const, enabled: true }],
      createdAt: '2024-01-01', updatedAt: '2024-01-01',
    },
    {
      id: '2', name: 'remote', transport: 'sse' as const,
      url: 'https://example.com/sse',
      headers: { Authorization: 'Bearer token' },
      source: 'manual' as const, enabled: true,
      clients: [{ client: 'claude-desktop' as const, enabled: true }],
      createdAt: '2024-01-01', updatedAt: '2024-01-01',
    },
  ];

  describe('Claude Desktop format', () => {
    it('generates correct mcpServers format', () => {
      const config = generateClaudeDesktopConfig(testServers);
      expect(config).toHaveProperty('mcpServers');
      const servers = config['mcpServers'] as Record<string, unknown>;
      expect(servers).toHaveProperty('github');
      expect(servers).toHaveProperty('remote');

      const github = servers['github'] as Record<string, unknown>;
      expect(github['command']).toBe('npx');
      expect(github['args']).toEqual(['-y', '@mcp/github']);
      expect(github['env']).toEqual({ TOKEN: 'test' });

      const remote = servers['remote'] as Record<string, unknown>;
      expect(remote['url']).toBe('https://example.com/sse');
      expect(remote['headers']).toEqual({ Authorization: 'Bearer token' });
    });
  });

  describe('VS Code format', () => {
    it('generates mcp.servers wrapper with type field', () => {
      const config = generateVSCodeConfig(testServers);
      expect(config).toHaveProperty('mcp');
      const mcp = config['mcp'] as Record<string, unknown>;
      expect(mcp).toHaveProperty('servers');
      const servers = mcp['servers'] as Record<string, unknown>;

      const github = servers['github'] as Record<string, unknown>;
      expect(github['type']).toBe('stdio');
      expect(github['command']).toBe('npx');

      const remote = servers['remote'] as Record<string, unknown>;
      expect(remote['type']).toBe('sse');
      expect(remote['url']).toBe('https://example.com/sse');
    });
  });

  describe('Zed format', () => {
    it('generates context_servers format', () => {
      const config = generateZedConfig(testServers);
      expect(config).toHaveProperty('context_servers');
      const servers = config['context_servers'] as Record<string, unknown>;
      expect(servers).toHaveProperty('github');
      expect(servers).toHaveProperty('remote');
    });
  });
});

describe('ConfigExporter', () => {
  let db: Database.Database;
  let inventory: InventoryManager;
  let exporter: ConfigExporter;

  beforeEach(() => {
    db = createTestDb();
    inventory = new InventoryManager(db);
    exporter = new ConfigExporter(inventory);
  });

  afterEach(() => {
    db.close();
  });

  it('exports config for a client', () => {
    inventory.create(makeTestServer('test1'));
    inventory.create(makeTestServer('test2'));

    const result = exporter.export('claude-desktop');
    expect(result.client).toBe('claude-desktop');
    expect(result.serverCount).toBe(2);
    expect(result.configJson).toContain('test1');
    expect(result.configJson).toContain('test2');
    expect(result.hash).toBeTruthy();
  });

  it('exports for all clients', () => {
    inventory.create(makeTestServer('test1'));
    const results = exporter.exportAll();
    expect(results.size).toBe(8); // all 8 clients
  });

  it('generates preview with diff', () => {
    inventory.create(makeTestServer('test1'));
    const preview = exporter.preview('claude-desktop');
    expect(preview.hasChanges).toBe(true);
    expect(preview.diff).toContain('test1');
  });

  it('writes config to disk', () => {
    inventory.create(makeTestServer('test1'));
    const result = exporter.export('claude-desktop');

    // Write to temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpman-test-'));
    const tmpFile = path.join(tmpDir, 'config.json');
    const modifiedResult = { ...result, filePath: tmpFile };

    const writeResult = exporter.write('claude-desktop', modifiedResult);
    expect(writeResult.written).toBe(true);
    expect(fs.existsSync(tmpFile)).toBe(true);

    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(content).toHaveProperty('mcpServers');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});
