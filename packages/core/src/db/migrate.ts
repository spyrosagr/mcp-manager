import type Database from 'better-sqlite3';
export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  applyInlineMigrations(db);
}

function applyInlineMigrations(db: Database.Database): void {
  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all()
      .map((row) => (row as { name: string }).name)
  );

  const migrations: Array<{ name: string; sql: string }> = [
    { name: '001_initial.sql', sql: MIGRATION_001 },
    { name: '002_health_checks.sql', sql: MIGRATION_002 },
    { name: '003_audit_results.sql', sql: MIGRATION_003 },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
    })();
  }
}

const MIGRATION_001 = `
-- Core server inventory table
CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    description TEXT,
    transport TEXT NOT NULL CHECK (transport IN ('stdio', 'sse', 'streamable-http')),
    command TEXT,
    args TEXT,
    cwd TEXT,
    url TEXT,
    headers TEXT,
    env_vars TEXT,
    source TEXT CHECK (source IN ('manual', 'imported', 'registry')),
    source_client TEXT,
    registry_id TEXT,
    repository_url TEXT,
    npm_package TEXT,
    pypi_package TEXT,
    docker_image TEXT,
    version TEXT,
    tags TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS server_clients (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    client TEXT NOT NULL CHECK (client IN (
        'claude-desktop', 'cursor', 'vscode', 'claude-code',
        'cline', 'windsurf', 'continue', 'zed'
    )),
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (server_id, client)
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profile_servers (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    PRIMARY KEY (profile_id, server_id)
);

CREATE TABLE IF NOT EXISTS export_history (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    client TEXT NOT NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    config_hash TEXT NOT NULL,
    config_snapshot TEXT NOT NULL,
    file_path TEXT NOT NULL,
    exported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);
CREATE INDEX IF NOT EXISTS idx_servers_transport ON servers(transport);
CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers(enabled);
CREATE INDEX IF NOT EXISTS idx_server_clients_client ON server_clients(client);
CREATE INDEX IF NOT EXISTS idx_export_history_client ON export_history(client);
`;

const MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS health_checks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'degraded', 'unknown', 'timeout')),
    response_time_ms INTEGER,
    protocol_version TEXT,
    server_name TEXT,
    server_version TEXT,
    tools_discovered TEXT,
    resources_discovered TEXT,
    prompts_discovered TEXT,
    capabilities TEXT,
    error_message TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_checks_server ON health_checks(server_id, checked_at DESC);
`;

const MIGRATION_003 = `
CREATE TABLE IF NOT EXISTS audit_runs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    scope TEXT NOT NULL CHECK (scope IN ('all', 'server', 'profile')),
    target_id TEXT,
    total_findings INTEGER NOT NULL DEFAULT 0,
    critical_count INTEGER NOT NULL DEFAULT 0,
    high_count INTEGER NOT NULL DEFAULT 0,
    medium_count INTEGER NOT NULL DEFAULT 0,
    low_count INTEGER NOT NULL DEFAULT 0,
    info_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_findings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    remediation TEXT,
    evidence TEXT,
    found_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_run ON audit_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_server ON audit_findings(server_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_severity ON audit_findings(severity);
`;
