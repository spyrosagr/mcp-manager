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
