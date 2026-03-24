import Database from 'better-sqlite3';
import type { RegistryServer } from './types.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS registry_servers (
    name TEXT PRIMARY KEY,
    description TEXT,
    version TEXT,
    repository_url TEXT,
    repository_source TEXT,
    packages TEXT,
    remotes TEXT,
    meta TEXT,
    raw_data TEXT,
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS registry_fts USING fts5(
    name,
    description,
    content='registry_servers',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS registry_ai AFTER INSERT ON registry_servers BEGIN
    INSERT INTO registry_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS registry_ad AFTER DELETE ON registry_servers BEGIN
    INSERT INTO registry_fts(registry_fts, rowid, name, description) VALUES ('delete', old.rowid, old.name, old.description);
END;

CREATE TRIGGER IF NOT EXISTS registry_au AFTER UPDATE ON registry_servers BEGIN
    INSERT INTO registry_fts(registry_fts, rowid, name, description) VALUES ('delete', old.rowid, old.name, old.description);
    INSERT INTO registry_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
END;

CREATE TABLE IF NOT EXISTS cache_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
`;

interface RegistryServerRow {
  name: string;
  description: string | null;
  version: string | null;
  repository_url: string | null;
  repository_source: string | null;
  packages: string | null;
  remotes: string | null;
  meta: string | null;
  raw_data: string | null;
  cached_at: string;
}

export class RegistryCache {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);
  }

  upsertServer(server: RegistryServer): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO registry_servers
        (name, description, version, repository_url, repository_source, packages, remotes, meta, raw_data, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      server.name,
      server.description,
      server.version,
      server.repository?.url ?? null,
      server.repository?.source ?? null,
      server.packages ? JSON.stringify(server.packages) : null,
      server.remotes ? JSON.stringify(server.remotes) : null,
      server.meta ? JSON.stringify(server.meta) : null,
      JSON.stringify(server),
    );
  }

  upsertMany(servers: RegistryServer[]): void {
    const tx = this.db.transaction((items: RegistryServer[]) => {
      for (const server of items) {
        this.upsertServer(server);
      }
    });
    tx(servers);
  }

  search(query: string, limit = 20): RegistryServer[] {
    // Use FTS5 for search
    const rows = this.db.prepare(`
      SELECT rs.* FROM registry_servers rs
      JOIN registry_fts fts ON rs.rowid = fts.rowid
      WHERE registry_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as RegistryServerRow[];
    return rows.map(hydrateServer);
  }

  getServer(name: string): RegistryServer | null {
    const row = this.db.prepare(
      'SELECT * FROM registry_servers WHERE name = ?',
    ).get(name) as RegistryServerRow | undefined;
    if (!row) return null;
    return hydrateServer(row);
  }

  list(limit = 20, offset = 0): RegistryServer[] {
    const rows = this.db.prepare(
      'SELECT * FROM registry_servers ORDER BY name LIMIT ? OFFSET ?',
    ).all(limit, offset) as RegistryServerRow[];
    return rows.map(hydrateServer);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM registry_servers').get() as { cnt: number };
    return row.cnt;
  }

  getLastRefreshed(): string | null {
    const row = this.db.prepare(
      "SELECT value FROM cache_meta WHERE key = 'last_refreshed'",
    ).get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  setLastRefreshed(timestamp: string): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO cache_meta (key, value) VALUES ('last_refreshed', ?)",
    ).run(timestamp);
  }

  isStale(maxAgeMs = 24 * 60 * 60 * 1000): boolean {
    const last = this.getLastRefreshed();
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > maxAgeMs;
  }

  close(): void {
    this.db.close();
  }
}

function hydrateServer(row: RegistryServerRow): RegistryServer {
  if (row.raw_data) {
    try {
      return JSON.parse(row.raw_data) as RegistryServer;
    } catch {
      // Fall through to manual hydration
    }
  }
  return {
    name: row.name,
    description: row.description || '',
    version: row.version || '',
    repository: {
      url: row.repository_url || '',
      source: row.repository_source || '',
    },
    packages: row.packages ? JSON.parse(row.packages) : undefined,
    remotes: row.remotes ? JSON.parse(row.remotes) : undefined,
    meta: row.meta ? JSON.parse(row.meta) : undefined,
  };
}
