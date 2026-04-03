import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { InventoryManager } from '../src/inventory/inventory.js';
import { ConfigExporter } from '../src/exporter/exporter.js';
import { importFromFile } from '../src/inventory/import.js';
import { runMigrations } from '../src/db/migrate.js';

const FIXTURES = path.join(__dirname, 'fixtures');

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('Import → Export round-trip', () => {
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

  it('imports from Claude Desktop and exports for Cursor', () => {
    // Import from Claude Desktop fixture
    const importResult = importFromFile(
      path.join(FIXTURES, 'claude-desktop-config.json'),
      'claude-desktop',
      inventory,
    );
    expect(importResult.imported).toBe(5);

    // Enable all imported servers for cursor
    for (const server of importResult.servers) {
      inventory.update(server.id, {
        clients: [
          ...server.clients,
          { client: 'cursor', enabled: true },
        ],
      });
    }

    // Export for Cursor
    const result = exporter.export('cursor');
    const config = JSON.parse(result.configJson);
    expect(config).toHaveProperty('mcpServers');
    expect(Object.keys(config.mcpServers)).toHaveLength(5);
    expect(config.mcpServers).toHaveProperty('github');
    expect(config.mcpServers.github.command).toBe('npx');
  });

  it('imports from VS Code and exports for Zed', () => {
    const importResult = importFromFile(
      path.join(FIXTURES, 'vscode-config.json'),
      'vscode',
      inventory,
    );
    expect(importResult.imported).toBe(2);

    // Enable for zed
    for (const server of importResult.servers) {
      inventory.update(server.id, {
        clients: [
          ...server.clients,
          { client: 'zed', enabled: true },
        ],
      });
    }

    const result = exporter.export('zed');
    const config = JSON.parse(result.configJson);
    expect(config).toHaveProperty('context_servers');
    // Should have the stdio server at minimum
    expect(config.context_servers).toHaveProperty('github');
  });

  it('imports from Claude Desktop and exports for VS Code', () => {
    importFromFile(
      path.join(FIXTURES, 'claude-desktop-config.json'),
      'claude-desktop',
      inventory,
    );

    // Enable all for vscode
    const servers = inventory.list();
    for (const server of servers) {
      inventory.update(server.id, {
        clients: [
          ...server.clients,
          { client: 'vscode', enabled: true },
        ],
      });
    }

    const result = exporter.export('vscode');
    const config = JSON.parse(result.configJson);
    expect(config).toHaveProperty('mcp');
    expect(config.mcp).toHaveProperty('servers');

    // VS Code format should have type field
    const github = config.mcp.servers.github;
    expect(github.type).toBe('stdio');
    expect(github.command).toBe('npx');
  });

  it('imports from all supported fixtures', () => {
    const fixtures: Array<{ file: string; client: import('../src/inventory/types.js').ClientType; expected: number }> = [
      { file: 'claude-desktop-config.json', client: 'claude-desktop', expected: 5 },
      { file: 'cursor-config.json', client: 'cursor', expected: 3 },
      { file: 'vscode-config.json', client: 'vscode', expected: 2 },
      { file: 'zed-settings.json', client: 'zed', expected: 1 },
      { file: 'claude-code-settings.json', client: 'claude-code', expected: 2 },
      { file: 'continue-config.json', client: 'continue', expected: 2 },
    ];

    let totalImported = 0;
    let totalSkipped = 0;

    for (const { file, client, expected } of fixtures) {
      const result = importFromFile(
        path.join(FIXTURES, file),
        client,
        inventory,
      );
      // Some servers may be duplicated across clients (e.g., "github")
      totalImported += result.imported;
      totalSkipped += result.skipped;
      expect(result.imported + result.skipped + result.errors.length).toBe(expected);
    }

    // At least some servers imported from each
    expect(totalImported).toBeGreaterThan(0);
    // Some duplicates expected (github appears in multiple fixtures)
    expect(totalSkipped).toBeGreaterThan(0);

    // All unique servers in the inventory
    const allServers = inventory.list();
    expect(allServers.length).toBe(totalImported);
  });

  it('uses profiles to export a subset of servers', () => {
    importFromFile(
      path.join(FIXTURES, 'claude-desktop-config.json'),
      'claude-desktop',
      inventory,
    );

    // Create a profile with only 2 servers
    const profile = inventory.createProfile('work', 'Work servers');
    const github = inventory.getByName('github')!;
    const postgres = inventory.getByName('postgres')!;
    inventory.addToProfile(profile.id, github.id);
    inventory.addToProfile(profile.id, postgres.id);

    // Export for claude-desktop using the profile
    const result = exporter.export('claude-desktop', { profileId: profile.id });
    expect(result.serverCount).toBe(2);

    const config = JSON.parse(result.configJson);
    expect(Object.keys(config.mcpServers)).toHaveLength(2);
    expect(config.mcpServers).toHaveProperty('github');
    expect(config.mcpServers).toHaveProperty('postgres');
  });
});
