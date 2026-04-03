import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrate.js';

describe('Database Migrations', () => {
  it('creates all required tables', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    // Check all tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('servers');
    expect(tableNames).toContain('server_clients');
    expect(tableNames).toContain('profiles');
    expect(tableNames).toContain('profile_servers');
    expect(tableNames).toContain('export_history');
    expect(tableNames).toContain('health_checks');
    expect(tableNames).toContain('audit_runs');
    expect(tableNames).toContain('audit_findings');
    expect(tableNames).toContain('_migrations');

    db.close();
  });

  it('is idempotent — running twice does not fail', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    runMigrations(db);

    const rows = db.prepare('SELECT COUNT(*) as count FROM _migrations').get() as { count: number };
    expect(rows.count).toBe(3); // 3 migrations
    db.close();
  });

  it('tracks applied migrations', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY id').all() as Array<{ name: string }>;
    expect(migrations).toHaveLength(3);
    expect(migrations[0]!.name).toBe('001_initial.sql');
    expect(migrations[1]!.name).toBe('002_health_checks.sql');
    expect(migrations[2]!.name).toBe('003_audit_results.sql');
    db.close();
  });

  it('enforces WAL mode and foreign keys', () => {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    const fk = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(fk[0]!.foreign_keys).toBe(1);

    db.close();
  });

  it('has correct indexes', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
    ).all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_servers_name');
    expect(indexNames).toContain('idx_servers_transport');
    expect(indexNames).toContain('idx_servers_enabled');
    expect(indexNames).toContain('idx_server_clients_client');
    expect(indexNames).toContain('idx_export_history_client');
    expect(indexNames).toContain('idx_health_checks_server');
    expect(indexNames).toContain('idx_audit_findings_run');
    expect(indexNames).toContain('idx_audit_findings_server');
    expect(indexNames).toContain('idx_audit_findings_severity');

    db.close();
  });

  it('enforces foreign key constraint on server_clients', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    expect(() => {
      db.prepare(
        "INSERT INTO server_clients (server_id, client, enabled) VALUES ('nonexistent', 'cursor', 1)",
      ).run();
    }).toThrow();

    db.close();
  });

  it('cascades delete from servers to server_clients', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    db.prepare(
      "INSERT INTO servers (id, name, transport, enabled, created_at, updated_at) VALUES ('s1', 'test', 'stdio', 1, datetime('now'), datetime('now'))",
    ).run();
    db.prepare(
      "INSERT INTO server_clients (server_id, client, enabled) VALUES ('s1', 'cursor', 1)",
    ).run();

    db.prepare("DELETE FROM servers WHERE id = 's1'").run();
    const clients = db.prepare("SELECT * FROM server_clients WHERE server_id = 's1'").all();
    expect(clients).toHaveLength(0);

    db.close();
  });
});
