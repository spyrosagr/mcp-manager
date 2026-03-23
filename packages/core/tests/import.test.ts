import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { InventoryManager } from '../src/inventory/inventory.js';
import { importFromFile } from '../src/inventory/import.js';
import { runMigrations } from '../src/db/migrate.js';

const FIXTURES = path.join(__dirname, 'fixtures');

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('importFromFile', () => {
  let db: Database.Database;
  let inventory: InventoryManager;

  beforeEach(() => {
    db = createTestDb();
    inventory = new InventoryManager(db);
  });

  afterEach(() => {
    db.close();
  });

  it('imports from Claude Desktop config', () => {
    const result = importFromFile(
      path.join(FIXTURES, 'claude-desktop-config.json'),
      'claude-desktop',
      inventory,
    );

    expect(result.imported).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.servers).toHaveLength(5);

    // Verify specific servers
    const github = inventory.getByName('github');
    expect(github).not.toBeNull();
    expect(github!.transport).toBe('stdio');
    expect(github!.command).toBe('npx');
    expect(github!.source).toBe('imported');
    expect(github!.sourceClient).toBe('claude-desktop');

    const supabase = inventory.getByName('supabase-remote');
    expect(supabase).not.toBeNull();
    expect(supabase!.transport).toBe('sse');
    expect(supabase!.url).toBe('https://mcp.supabase.com/sse');
  });

  it('imports from Cursor config', () => {
    const result = importFromFile(
      path.join(FIXTURES, 'cursor-config.json'),
      'cursor',
      inventory,
    );
    expect(result.imported).toBe(3);
  });

  it('imports from VS Code config (mcp.servers wrapper)', () => {
    const result = importFromFile(
      path.join(FIXTURES, 'vscode-config.json'),
      'vscode',
      inventory,
    );
    expect(result.imported).toBe(2);

    const webSearch = inventory.getByName('web-search');
    expect(webSearch).not.toBeNull();
    expect(webSearch!.transport).toBe('sse');
    expect(webSearch!.url).toBe('https://search.example.com/mcp/sse');
  });

  it('imports from Zed config (context_servers)', () => {
    const result = importFromFile(
      path.join(FIXTURES, 'zed-settings.json'),
      'zed',
      inventory,
    );
    expect(result.imported).toBe(1);
    expect(result.servers[0]!.name).toBe('github');
  });

  it('skips existing servers', () => {
    // Import once
    importFromFile(
      path.join(FIXTURES, 'claude-desktop-config.json'),
      'claude-desktop',
      inventory,
    );

    // Import again - should skip all
    const result = importFromFile(
      path.join(FIXTURES, 'claude-desktop-config.json'),
      'claude-desktop',
      inventory,
    );
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(5);
  });

  it('handles env variables', () => {
    importFromFile(
      path.join(FIXTURES, 'claude-desktop-config.json'),
      'claude-desktop',
      inventory,
    );

    const slack = inventory.getByName('slack');
    expect(slack).not.toBeNull();
    expect(slack!.envVars).toEqual({
      SLACK_BOT_TOKEN: 'xoxb-test-token',
      SLACK_TEAM_ID: 'T1234567',
    });
  });

  it('throws on non-existent file', () => {
    expect(() =>
      importFromFile('/nonexistent/path.json', 'claude-desktop', inventory),
    ).toThrow('not readable');
  });
});
