import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { InventoryManager } from '../src/inventory/inventory.js';
import { runMigrations } from '../src/db/migrate.js';
import type { CreateServerInput } from '../src/inventory/types.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeStdioServer(overrides: Partial<CreateServerInput> = {}): CreateServerInput {
  return {
    name: 'test-server',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@test/server'],
    source: 'manual',
    enabled: true,
    clients: [{ client: 'claude-desktop', enabled: true }],
    ...overrides,
  };
}

describe('InventoryManager', () => {
  let db: Database.Database;
  let inventory: InventoryManager;

  beforeEach(() => {
    db = createTestDb();
    inventory = new InventoryManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('creates a server and returns it', () => {
      const server = inventory.create(makeStdioServer());
      expect(server.id).toBeTruthy();
      expect(server.name).toBe('test-server');
      expect(server.transport).toBe('stdio');
      expect(server.command).toBe('npx');
      expect(server.args).toEqual(['-y', '@test/server']);
      expect(server.enabled).toBe(true);
      expect(server.clients).toHaveLength(1);
      expect(server.clients[0]?.client).toBe('claude-desktop');
    });

    it('rejects duplicate names', () => {
      inventory.create(makeStdioServer());
      expect(() => inventory.create(makeStdioServer())).toThrow('already exists');
    });

    it('creates SSE server', () => {
      const server = inventory.create(makeStdioServer({
        name: 'remote-server',
        transport: 'sse',
        command: undefined,
        args: undefined,
        url: 'https://example.com/sse',
        headers: { 'Authorization': 'Bearer token' },
      }));
      expect(server.transport).toBe('sse');
      expect(server.url).toBe('https://example.com/sse');
      expect(server.headers).toEqual({ Authorization: 'Bearer token' });
    });

    it('stores environment variables', () => {
      const server = inventory.create(makeStdioServer({
        envVars: { API_KEY: 'test-key', SECRET: 'test-secret' },
      }));
      expect(server.envVars).toEqual({ API_KEY: 'test-key', SECRET: 'test-secret' });
    });

    it('stores tags', () => {
      const server = inventory.create(makeStdioServer({ tags: ['database', 'sql'] }));
      expect(server.tags).toEqual(['database', 'sql']);
    });
  });

  describe('getById / getByName', () => {
    it('retrieves server by id', () => {
      const created = inventory.create(makeStdioServer());
      const fetched = inventory.getById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('test-server');
    });

    it('retrieves server by name', () => {
      inventory.create(makeStdioServer());
      const fetched = inventory.getByName('test-server');
      expect(fetched).not.toBeNull();
      expect(fetched!.transport).toBe('stdio');
    });

    it('returns null for non-existent', () => {
      expect(inventory.getById('nonexistent')).toBeNull();
      expect(inventory.getByName('nonexistent')).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      inventory.create(makeStdioServer({ name: 'server-a', tags: ['web'] }));
      inventory.create(makeStdioServer({
        name: 'server-b',
        transport: 'sse',
        command: undefined,
        args: undefined,
        url: 'https://b.example.com/sse',
        enabled: false,
        clients: [{ client: 'cursor', enabled: true }],
      }));
      inventory.create(makeStdioServer({
        name: 'server-c',
        tags: ['database'],
        clients: [
          { client: 'claude-desktop', enabled: true },
          { client: 'vscode', enabled: true },
        ],
      }));
    });

    it('lists all servers', () => {
      const servers = inventory.list();
      expect(servers).toHaveLength(3);
    });

    it('filters by transport', () => {
      const servers = inventory.list({ transport: 'sse' });
      expect(servers).toHaveLength(1);
      expect(servers[0]!.name).toBe('server-b');
    });

    it('filters by enabled status', () => {
      const enabled = inventory.list({ enabled: true });
      expect(enabled).toHaveLength(2);
      const disabled = inventory.list({ enabled: false });
      expect(disabled).toHaveLength(1);
    });

    it('filters by client', () => {
      const servers = inventory.list({ client: 'vscode' });
      expect(servers).toHaveLength(1);
      expect(servers[0]!.name).toBe('server-c');
    });

    it('filters by tags', () => {
      const servers = inventory.list({ tags: ['database'] });
      expect(servers).toHaveLength(1);
      expect(servers[0]!.name).toBe('server-c');
    });

    it('supports search', () => {
      const servers = inventory.list({ search: 'server-a' });
      expect(servers).toHaveLength(1);
    });

    it('sorts by name', () => {
      const asc = inventory.list({ sortBy: 'name', sortOrder: 'asc' });
      expect(asc[0]!.name).toBe('server-a');
      const desc = inventory.list({ sortBy: 'name', sortOrder: 'desc' });
      expect(desc[0]!.name).toBe('server-c');
    });

    it('supports limit and offset', () => {
      const servers = inventory.list({ limit: 1, offset: 1 });
      expect(servers).toHaveLength(1);
      expect(servers[0]!.name).toBe('server-b');
    });
  });

  describe('update', () => {
    it('updates server fields', () => {
      const server = inventory.create(makeStdioServer());
      const updated = inventory.update(server.id, {
        displayName: 'My Test Server',
        description: 'A test',
      });
      expect(updated.displayName).toBe('My Test Server');
      expect(updated.description).toBe('A test');
    });

    it('updates enabled status', () => {
      const server = inventory.create(makeStdioServer());
      const updated = inventory.update(server.id, { enabled: false });
      expect(updated.enabled).toBe(false);
    });

    it('updates clients', () => {
      const server = inventory.create(makeStdioServer());
      const updated = inventory.update(server.id, {
        clients: [
          { client: 'cursor', enabled: true },
          { client: 'vscode', enabled: true },
        ],
      });
      expect(updated.clients).toHaveLength(2);
      expect(updated.clients.map((c) => c.client).sort()).toEqual(['cursor', 'vscode']);
    });

    it('throws for non-existent server', () => {
      expect(() => inventory.update('nonexistent', { enabled: false })).toThrow('not found');
    });

    it('rejects duplicate name on rename', () => {
      inventory.create(makeStdioServer({ name: 'a' }));
      const b = inventory.create(makeStdioServer({ name: 'b' }));
      expect(() => inventory.update(b.id, { name: 'a' })).toThrow('already exists');
    });
  });

  describe('delete', () => {
    it('deletes a server', () => {
      const server = inventory.create(makeStdioServer());
      inventory.delete(server.id);
      expect(inventory.getById(server.id)).toBeNull();
    });

    it('cascades to server_clients', () => {
      const server = inventory.create(makeStdioServer());
      inventory.delete(server.id);
      const rows = db.prepare('SELECT * FROM server_clients WHERE server_id = ?').all(server.id);
      expect(rows).toHaveLength(0);
    });

    it('throws for non-existent server', () => {
      expect(() => inventory.delete('nonexistent')).toThrow('not found');
    });
  });

  describe('profiles', () => {
    it('creates and lists profiles', () => {
      inventory.createProfile('work', 'Work servers');
      inventory.createProfile('personal');
      const profiles = inventory.listProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles[0]!.name).toBe('personal');
      expect(profiles[1]!.name).toBe('work');
      expect(profiles[1]!.description).toBe('Work servers');
    });

    it('adds and removes servers from profiles', () => {
      const profile = inventory.createProfile('test');
      const server = inventory.create(makeStdioServer());
      inventory.addToProfile(profile.id, server.id);

      const servers = inventory.getServersInProfile(profile.id);
      expect(servers).toHaveLength(1);
      expect(servers[0]!.name).toBe('test-server');

      inventory.removeFromProfile(profile.id, server.id);
      expect(inventory.getServersInProfile(profile.id)).toHaveLength(0);
    });

    it('sets default profile', () => {
      const p1 = inventory.createProfile('a');
      const p2 = inventory.createProfile('b');
      inventory.setDefaultProfile(p2.id);

      const profiles = inventory.listProfiles();
      const defaultProfile = profiles.find((p) => p.isDefault);
      expect(defaultProfile?.name).toBe('b');
    });
  });

  describe('getServersForClient', () => {
    it('returns enabled servers for a client', () => {
      inventory.create(makeStdioServer({ name: 'a', clients: [{ client: 'claude-desktop', enabled: true }] }));
      inventory.create(makeStdioServer({ name: 'b', clients: [{ client: 'cursor', enabled: true }] }));
      inventory.create(makeStdioServer({ name: 'c', enabled: false, clients: [{ client: 'claude-desktop', enabled: true }] }));

      const servers = inventory.getServersForClient('claude-desktop');
      expect(servers).toHaveLength(1);
      expect(servers[0]!.name).toBe('a');
    });
  });
});
