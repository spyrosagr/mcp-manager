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
