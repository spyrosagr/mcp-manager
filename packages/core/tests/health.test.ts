import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { InventoryManager } from '../src/inventory/inventory.js';
import { HealthChecker } from '../src/health/checker.js';
import { runMigrations } from '../src/db/migrate.js';
import type { CreateServerInput } from '../src/inventory/types.js';
import type { HealthCheckResult } from '../src/health/types.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeServer(overrides: Partial<CreateServerInput> = {}): CreateServerInput {
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

function insertHealthResult(db: Database.Database, result: Partial<HealthCheckResult> & { serverId: string }): void {
  db.prepare(`
    INSERT INTO health_checks (server_id, status, response_time_ms, protocol_version,
      server_name, server_version, tools_discovered, resources_discovered,
      prompts_discovered, capabilities, error_message, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.serverId,
    result.status ?? 'healthy',
    result.responseTimeMs ?? 100,
    result.protocolVersion ?? '2024-11-05',
    result.serverInfo?.name ?? 'test',
    result.serverInfo?.version ?? '1.0.0',
    result.tools ? JSON.stringify(result.tools) : null,
    result.resources ? JSON.stringify(result.resources) : null,
    result.prompts ? JSON.stringify(result.prompts) : null,
    result.capabilities ? JSON.stringify(result.capabilities) : null,
    result.error ?? null,
    result.checkedAt ?? new Date().toISOString(),
  );
}

describe('HealthChecker', () => {
  let db: Database.Database;
  let inventory: InventoryManager;
  let checker: HealthChecker;

  beforeEach(() => {
    db = createTestDb();
    inventory = new InventoryManager(db);
    checker = new HealthChecker(db, inventory);
  });

  afterEach(() => {
    db.close();
  });

  describe('getLatestStatus', () => {
    it('returns null for unknown server', () => {
      const result = checker.getLatestStatus('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the latest health check result', () => {
      const server = inventory.create(makeServer({ name: 'health-test' }));

      // Insert two results — should return the latest
      insertHealthResult(db, {
        serverId: server.id,
        status: 'unhealthy',
        checkedAt: '2026-01-01T00:00:00Z',
      });
      insertHealthResult(db, {
        serverId: server.id,
        status: 'healthy',
        responseTimeMs: 50,
        checkedAt: '2026-01-02T00:00:00Z',
      });

      const result = checker.getLatestStatus(server.id);
      expect(result).toBeDefined();
      expect(result!.status).toBe('healthy');
      expect(result!.responseTimeMs).toBe(50);
    });

    it('hydrates tools from JSON', () => {
      const server = inventory.create(makeServer({ name: 'tools-test' }));

      insertHealthResult(db, {
        serverId: server.id,
        tools: [
          { name: 'read_file', description: 'Read a file' },
          { name: 'write_file', description: 'Write a file' },
        ],
        checkedAt: new Date().toISOString(),
      });

      const result = checker.getLatestStatus(server.id);
      expect(result!.tools).toHaveLength(2);
      expect(result!.tools![0]!.name).toBe('read_file');
    });
  });

  describe('getHistory', () => {
    it('returns empty array for unknown server', () => {
      const history = checker.getHistory('nonexistent');
      expect(history).toEqual([]);
    });

    it('returns history in descending order', () => {
      const server = inventory.create(makeServer({ name: 'history-test' }));

      insertHealthResult(db, { serverId: server.id, checkedAt: '2026-01-01T00:00:00Z' });
      insertHealthResult(db, { serverId: server.id, checkedAt: '2026-01-03T00:00:00Z' });
      insertHealthResult(db, { serverId: server.id, checkedAt: '2026-01-02T00:00:00Z' });

      const history = checker.getHistory(server.id);
      expect(history).toHaveLength(3);
      expect(history[0]!.checkedAt).toBe('2026-01-03T00:00:00Z');
      expect(history[2]!.checkedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('respects limit parameter', () => {
      const server = inventory.create(makeServer({ name: 'limit-test' }));

      for (let i = 0; i < 5; i++) {
        insertHealthResult(db, {
          serverId: server.id,
          checkedAt: `2026-01-0${i + 1}T00:00:00Z`,
        });
      }

      const history = checker.getHistory(server.id, 2);
      expect(history).toHaveLength(2);
    });
  });

  describe('prune', () => {
    it('removes old results beyond keepPerServer', () => {
      const server = inventory.create(makeServer({ name: 'prune-test' }));

      for (let i = 0; i < 10; i++) {
        insertHealthResult(db, {
          serverId: server.id,
          checkedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        });
      }

      const deleted = checker.prune(3);
      expect(deleted).toBe(7);

      const remaining = checker.getHistory(server.id);
      expect(remaining).toHaveLength(3);
    });

    it('handles multiple servers independently', () => {
      const s1 = inventory.create(makeServer({ name: 'prune-s1' }));
      const s2 = inventory.create(makeServer({ name: 'prune-s2' }));

      for (let i = 0; i < 5; i++) {
        insertHealthResult(db, {
          serverId: s1.id,
          checkedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        });
        insertHealthResult(db, {
          serverId: s2.id,
          checkedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        });
      }

      const deleted = checker.prune(2);
      expect(deleted).toBe(6); // 3 from each server

      expect(checker.getHistory(s1.id)).toHaveLength(2);
      expect(checker.getHistory(s2.id)).toHaveLength(2);
    });
  });

  describe('saveResult (via check)', () => {
    it('persists results that can be queried', () => {
      const server = inventory.create(makeServer({ name: 'save-test' }));

      // Manually insert a result to simulate what check() does
      insertHealthResult(db, {
        serverId: server.id,
        status: 'healthy',
        responseTimeMs: 42,
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'test-server', version: '1.0.0' },
        tools: [{ name: 'echo' }],
        resources: [{ uri: 'file:///test', name: 'test' }],
        prompts: [{ name: 'greeting' }],
        checkedAt: new Date().toISOString(),
      });

      const result = checker.getLatestStatus(server.id);
      expect(result).toBeDefined();
      expect(result!.status).toBe('healthy');
      expect(result!.responseTimeMs).toBe(42);
      expect(result!.protocolVersion).toBe('2024-11-05');
      expect(result!.serverInfo?.name).toBe('test-server');
      expect(result!.tools).toHaveLength(1);
      expect(result!.resources).toHaveLength(1);
      expect(result!.prompts).toHaveLength(1);
    });
  });
});
