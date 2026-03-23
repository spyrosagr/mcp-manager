# MCP Configuration Manager & Server Registry — Full Project Specification

> **Purpose**: This document is a complete implementation specification designed to be fed directly to Claude Code. It contains every architectural decision, data model, API contract, CLI command, UI wireframe description, file structure, dependency list, and acceptance criterion needed to build this project from scratch with zero ambiguity.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement & Market Context](#2-problem-statement--market-context)
3. [Target Users & Personas](#3-target-users--personas)
4. [Architecture Overview](#4-architecture-overview)
5. [Technology Stack](#5-technology-stack)
6. [Repository Structure](#6-repository-structure)
7. [Data Models & Database Schema](#7-data-models--database-schema)
8. [Core Module: Server Inventory](#8-core-module-server-inventory)
9. [Core Module: Config Export Engine](#9-core-module-config-export-engine)
10. [Core Module: Health Checker](#10-core-module-health-checker)
11. [Core Module: Security Auditor](#11-core-module-security-auditor)
12. [Core Module: Community Registry Browser](#12-core-module-community-registry-browser)
13. [CLI Application](#13-cli-application)
14. [Web UI Application](#14-web-ui-application)
15. [Configuration & Environment](#15-configuration--environment)
16. [Authentication & Authorization](#16-authentication--authorization)
17. [Testing Strategy](#17-testing-strategy)
18. [Error Handling & Logging](#18-error-handling--logging)
19. [Performance & Scalability](#19-performance--scalability)
20. [Deployment & Packaging](#20-deployment--packaging)
21. [Development Phases & Milestones](#21-development-phases--milestones)
22. [Appendix A: Client Config Format Reference](#appendix-a-client-config-format-reference)
23. [Appendix B: MCP Registry API Reference](#appendix-b-mcp-registry-api-reference)
24. [Appendix C: Security Audit Rules](#appendix-c-security-audit-rules)
25. [Appendix D: Glossary](#appendix-d-glossary)

---

## 1. Project Overview

**Project Name**: `mcpman` (MCP Manager)

**One-line description**: A CLI and web UI that maintains a single inventory of MCP servers and exports correctly-formatted configurations for every major MCP client, with health-checking, security auditing, and community registry browsing.

**Core value proposition**: Users currently hand-edit JSON config files separately for Claude Desktop, Cursor, VS Code, Claude Code, Cline, Windsurf, and other MCP clients. Each client uses a slightly different config format and file path. This is painful, error-prone, and insecure. `mcpman` eliminates this by providing one canonical source of truth for all MCP server configurations.

**Scope**: This is a local-first tool. The inventory database lives on the user's machine. The web UI runs locally. Network access is only used for health-checking remote servers, fetching the official MCP Registry, and optional cloud sync (Phase 3+).

---

## 2. Problem Statement & Market Context

### The Pain

The MCP ecosystem has grown to thousands of server implementations. The official MCP Registry (launched September 2025 at `registry.modelcontextprotocol.io`) catalogs publicly available servers, but no tool exists to manage the user's *personal* MCP server configurations across clients.

The configuration portability gap is explicitly listed on the official MCP roadmap (last updated 2026-03-05) as an unresolved priority: "a way to configure a server once and have that configuration work across different MCP clients."

### Current Client Config Landscape

Each MCP client has its own config file path and a slightly different JSON schema:

| Client | Config File Location (macOS) | Top-level Key | Notes |
|--------|------------------------------|---------------|-------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers` | Requires full restart after edit |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | Same schema as Claude Desktop |
| VS Code (Copilot) | `.vscode/mcp.json` (workspace) or user settings | `mcp.servers` | Wraps in `{"mcp": {"servers": {...}}}` |
| Claude Code | `~/.claude/settings.json` | `mcpServers` | Under the `mcpServers` key in settings |
| Cline | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `mcpServers` | Same schema as Claude Desktop |
| Windsurf | `~/.windsurf/mcp.json` | `mcpServers` | Same schema as Claude Desktop |
| Continue | `~/.continue/config.json` | `mcpServers` | Within the broader Continue config |
| Zed | `~/.config/zed/settings.json` | `context_servers` | Different schema entirely |

### Security Landscape

Research has found that a majority of MCP servers use insecure static API keys. Common issues include hardcoded secrets in config files, lack of encryption for transport, no credential rotation, and environment variables containing secrets committed to version control. A built-in security auditor that flags these issues would be an immediate differentiator.

---

## 3. Target Users & Personas

### Persona 1: Power Developer ("Alex")
- Uses Claude Desktop, Cursor, and VS Code simultaneously
- Has 10-15 MCP servers configured
- Maintains configs manually, frequently breaks one when updating another
- Wants: single source of truth, one-command sync, health visibility

### Persona 2: Team Lead ("Jordan")
- Manages a team that needs consistent MCP server configs
- Wants: export shareable config profiles, security audit before deployment
- Needs: web UI for visibility, CLI for automation in CI/CD

### Persona 3: Explorer ("Sam")
- New to MCP, wants to discover and try servers
- Wants: browse the registry, one-click install, see what tools a server exposes
- Needs: web UI with search, filtering, and install wizard

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     mcpman                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │   CLI    │  │   Web UI     │  │  Programmatic │ │
│  │ (Commander)│ │ (Next.js)    │  │  API (REST)   │ │
│  └─────┬────┘  └──────┬───────┘  └──────┬────────┘ │
│        │               │                 │          │
│        └───────────────┼─────────────────┘          │
│                        │                            │
│              ┌─────────▼──────────┐                 │
│              │   Core Engine      │                 │
│              │                    │                 │
│              │ ┌────────────────┐ │                 │
│              │ │ Inventory Mgr  │ │                 │
│              │ ├────────────────┤ │                 │
│              │ │ Config Exporter│ │                 │
│              │ ├────────────────┤ │                 │
│              │ │ Health Checker │ │                 │
│              │ ├────────────────┤ │                 │
│              │ │ Security Audit │ │                 │
│              │ ├────────────────┤ │                 │
│              │ │ Registry Client│ │                 │
│              │ └────────────────┘ │                 │
│              └─────────┬──────────┘                 │
│                        │                            │
│              ┌─────────▼──────────┐                 │
│              │   Data Layer       │                 │
│              │   (SQLite via      │                 │
│              │    better-sqlite3) │                 │
│              └────────────────────┘                 │
│                                                     │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
  ┌──────────────┐   ┌───────────────────┐
  │ Local Client  │   │ MCP Registry API  │
  │ Config Files  │   │ (registry.        │
  │ (Claude, etc.)│   │  modelcontext     │
  │               │   │  protocol.io)     │
  └──────────────┘   └───────────────────┘
```

### Key Architectural Decisions

1. **Monorepo**: Single repository with `packages/` workspace structure using npm workspaces.
2. **TypeScript everywhere**: CLI, core engine, web UI — all TypeScript for consistency and type safety.
3. **SQLite for local storage**: Zero-config, portable, embeddable. No external database dependency.
4. **Core engine is a library**: The CLI and web UI both import the same `@mcpman/core` package. No logic duplication.
5. **Local-first**: Everything works offline except health-checking remote servers and registry browsing.
6. **Config files are never the source of truth**: `mcpman`'s SQLite database is the source of truth. Config files are *exports* — generated artifacts.

---

## 5. Technology Stack

### Runtime & Language
- **Node.js** >= 20.x (LTS)
- **TypeScript** 5.x with strict mode enabled
- `"strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true`

### Core Engine (`@mcpman/core`)
- **better-sqlite3**: Synchronous SQLite driver, no ORM — raw SQL with typed wrappers
- **zod**: Schema validation for all data models, config formats, and API responses
- **glob**: File system pattern matching for config file discovery
- **undici**: HTTP client for health checks and registry API calls (built into Node 20+)
- **dotenv**: Environment variable loading for development

### CLI (`@mcpman/cli`)
- **commander**: CLI argument parsing and subcommand routing
- **chalk**: Terminal coloring
- **ora**: Spinners for async operations
- **cli-table3**: Tabular output
- **inquirer**: Interactive prompts (for `mcpman add` wizard)
- **update-notifier**: Notify users of new versions

### Web UI (`@mcpman/web`)
- **Next.js 14+** with App Router
- **React 18+**
- **Tailwind CSS** for styling
- **shadcn/ui** for component library (built on Radix UI primitives)
- **TanStack Query (React Query)** for server state management
- **Lucide React** for icons
- **next-themes** for dark mode support

### Development & Build
- **tsup**: Fast TypeScript bundling for the core and CLI packages
- **vitest**: Unit and integration testing
- **playwright**: E2E testing for the web UI
- **eslint** with `@typescript-eslint` and `eslint-plugin-import`
- **prettier**: Code formatting
- **husky** + **lint-staged**: Pre-commit hooks
- **changesets**: Version management and changelogs
- **tsx**: TypeScript execution for development scripts

---

## 6. Repository Structure

```
mcpman/
├── package.json                     # Root workspace config
├── tsconfig.base.json               # Shared TS config
├── turbo.json                       # Turborepo config (optional, for monorepo task orchestration)
├── .env.example                     # Example environment variables
├── .gitignore
├── .prettierrc
├── .eslintrc.js
├── README.md
├── LICENSE                          # MIT
├── CONTRIBUTING.md
│
├── packages/
│   ├── core/                        # @mcpman/core — the engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts             # Public API barrel export
│   │   │   ├── db/
│   │   │   │   ├── connection.ts    # SQLite connection factory
│   │   │   │   ├── migrations/      # Numbered SQL migration files
│   │   │   │   │   ├── 001_initial.sql
│   │   │   │   │   ├── 002_health_checks.sql
│   │   │   │   │   └── 003_audit_results.sql
│   │   │   │   └── migrate.ts       # Migration runner
│   │   │   ├── inventory/
│   │   │   │   ├── inventory.ts     # CRUD operations for MCP servers
│   │   │   │   ├── types.ts         # Zod schemas and TypeScript types
│   │   │   │   └── import.ts        # Import from existing client configs
│   │   │   ├── exporter/
│   │   │   │   ├── exporter.ts      # Config export orchestrator
│   │   │   │   ├── clients/
│   │   │   │   │   ├── claude-desktop.ts
│   │   │   │   │   ├── cursor.ts
│   │   │   │   │   ├── vscode.ts
│   │   │   │   │   ├── claude-code.ts
│   │   │   │   │   ├── cline.ts
│   │   │   │   │   ├── windsurf.ts
│   │   │   │   │   ├── continue.ts
│   │   │   │   │   └── zed.ts
│   │   │   │   └── types.ts         # Client-specific config schemas
│   │   │   ├── health/
│   │   │   │   ├── checker.ts       # Health check orchestrator
│   │   │   │   ├── stdio-probe.ts   # Probe STDIO-based servers
│   │   │   │   ├── http-probe.ts    # Probe HTTP/SSE-based servers
│   │   │   │   ├── tool-discovery.ts # Enumerate tools a server exposes
│   │   │   │   └── types.ts
│   │   │   ├── security/
│   │   │   │   ├── auditor.ts       # Security audit orchestrator
│   │   │   │   ├── rules/
│   │   │   │   │   ├── hardcoded-secrets.ts
│   │   │   │   │   ├── transport-security.ts
│   │   │   │   │   ├── env-var-exposure.ts
│   │   │   │   │   ├── permission-scope.ts
│   │   │   │   │   └── dependency-check.ts
│   │   │   │   └── types.ts
│   │   │   ├── registry/
│   │   │   │   ├── client.ts        # Official MCP Registry API client
│   │   │   │   ├── cache.ts         # Local cache for registry data
│   │   │   │   ├── search.ts        # Search and filter logic
│   │   │   │   └── types.ts
│   │   │   └── utils/
│   │   │       ├── paths.ts         # OS-specific path resolution
│   │   │       ├── platform.ts      # Platform detection (macOS/Linux/Windows)
│   │   │       ├── crypto.ts        # Encryption helpers for secrets
│   │   │       └── errors.ts        # Custom error classes
│   │   └── tests/
│   │       ├── inventory.test.ts
│   │       ├── exporter.test.ts
│   │       ├── health.test.ts
│   │       ├── security.test.ts
│   │       ├── registry.test.ts
│   │       └── fixtures/
│   │           ├── claude-desktop-config.json
│   │           ├── cursor-config.json
│   │           ├── vscode-config.json
│   │           └── sample-servers.json
│   │
│   ├── cli/                         # @mcpman/cli
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts             # Entry point, Commander setup
│   │   │   ├── commands/
│   │   │   │   ├── add.ts           # mcpman add
│   │   │   │   ├── remove.ts        # mcpman remove
│   │   │   │   ├── list.ts          # mcpman list
│   │   │   │   ├── edit.ts          # mcpman edit
│   │   │   │   ├── export.ts        # mcpman export
│   │   │   │   ├── import.ts        # mcpman import
│   │   │   │   ├── health.ts        # mcpman health
│   │   │   │   ├── audit.ts         # mcpman audit
│   │   │   │   ├── registry.ts      # mcpman registry
│   │   │   │   ├── doctor.ts        # mcpman doctor
│   │   │   │   ├── profile.ts       # mcpman profile
│   │   │   │   └── config.ts        # mcpman config
│   │   │   ├── formatters/
│   │   │   │   ├── table.ts         # Table output formatting
│   │   │   │   ├── json.ts          # JSON output formatting
│   │   │   │   └── yaml.ts          # YAML output formatting
│   │   │   └── utils/
│   │   │       ├── output.ts        # Output helpers (colors, spinners)
│   │   │       └── interactive.ts   # Inquirer prompt helpers
│   │   └── tests/
│   │       ├── commands/
│   │       │   ├── add.test.ts
│   │       │   ├── export.test.ts
│   │       │   └── health.test.ts
│   │       └── fixtures/
│   │
│   └── web/                         # @mcpman/web
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.js
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx       # Root layout with providers
│       │   │   ├── page.tsx         # Dashboard home
│       │   │   ├── servers/
│       │   │   │   ├── page.tsx     # Server inventory list
│       │   │   │   ├── [id]/
│       │   │   │   │   └── page.tsx # Server detail/edit
│       │   │   │   └── add/
│       │   │   │       └── page.tsx # Add server wizard
│       │   │   ├── export/
│       │   │   │   └── page.tsx     # Export config page
│       │   │   ├── health/
│       │   │   │   └── page.tsx     # Health dashboard
│       │   │   ├── audit/
│       │   │   │   └── page.tsx     # Security audit results
│       │   │   ├── registry/
│       │   │   │   ├── page.tsx     # Browse community registry
│       │   │   │   └── [name]/
│       │   │   │       └── page.tsx # Server detail from registry
│       │   │   ├── profiles/
│       │   │   │   └── page.tsx     # Manage config profiles
│       │   │   └── settings/
│       │   │       └── page.tsx     # App settings
│       │   ├── api/                 # Next.js API routes (thin wrappers around @mcpman/core)
│       │   │   ├── servers/
│       │   │   │   ├── route.ts     # GET (list), POST (create)
│       │   │   │   └── [id]/
│       │   │   │       └── route.ts # GET, PUT, DELETE
│       │   │   ├── export/
│       │   │   │   └── route.ts     # POST (trigger export)
│       │   │   ├── health/
│       │   │   │   └── route.ts     # POST (trigger health check)
│       │   │   ├── audit/
│       │   │   │   └── route.ts     # POST (trigger audit)
│       │   │   ├── registry/
│       │   │   │   └── route.ts     # GET (search registry)
│       │   │   └── profiles/
│       │   │       └── route.ts     # CRUD for profiles
│       │   ├── components/
│       │   │   ├── ui/              # shadcn/ui components
│       │   │   ├── layout/
│       │   │   │   ├── sidebar.tsx
│       │   │   │   ├── header.tsx
│       │   │   │   └── footer.tsx
│       │   │   ├── servers/
│       │   │   │   ├── server-card.tsx
│       │   │   │   ├── server-form.tsx
│       │   │   │   ├── server-table.tsx
│       │   │   │   └── transport-badge.tsx
│       │   │   ├── health/
│       │   │   │   ├── health-badge.tsx
│       │   │   │   ├── health-dashboard.tsx
│       │   │   │   └── tool-list.tsx
│       │   │   ├── audit/
│       │   │   │   ├── audit-report.tsx
│       │   │   │   ├── finding-card.tsx
│       │   │   │   └── severity-badge.tsx
│       │   │   ├── registry/
│       │   │   │   ├── registry-browser.tsx
│       │   │   │   ├── registry-card.tsx
│       │   │   │   └── install-wizard.tsx
│       │   │   └── export/
│       │   │       ├── client-selector.tsx
│       │   │       └── diff-viewer.tsx
│       │   ├── hooks/
│       │   │   ├── use-servers.ts
│       │   │   ├── use-health.ts
│       │   │   ├── use-audit.ts
│       │   │   └── use-registry.ts
│       │   └── lib/
│       │       ├── api-client.ts    # Fetch wrapper for API routes
│       │       └── utils.ts
│       └── tests/
│           └── e2e/
│               ├── servers.spec.ts
│               ├── export.spec.ts
│               └── registry.spec.ts
│
├── scripts/
│   ├── setup.ts                     # First-run setup script
│   └── seed-registry-cache.ts       # Pre-populate registry cache
│
└── docs/
    ├── architecture.md
    ├── contributing.md
    └── security.md
```

---

## 7. Data Models & Database Schema

### 7.1 SQLite Database Location

The database file lives at `~/.mcpman/mcpman.db`. The directory `~/.mcpman/` is also used for:
- `~/.mcpman/mcpman.db` — main database
- `~/.mcpman/mcpman.db-wal` — WAL journal (auto-created by SQLite)
- `~/.mcpman/registry-cache.db` — separate SQLite database for registry cache
- `~/.mcpman/config.json` — mcpman's own settings
- `~/.mcpman/backups/` — auto-backups before destructive operations

### 7.2 Migration 001: Initial Schema

```sql
-- 001_initial.sql

-- Core server inventory table
CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,                    -- User-chosen identifier, e.g. "github"
    display_name TEXT,                            -- Human-friendly name, e.g. "GitHub MCP Server"
    description TEXT,                             -- What this server does
    transport TEXT NOT NULL CHECK (transport IN ('stdio', 'sse', 'streamable-http')),

    -- STDIO transport fields
    command TEXT,                                 -- e.g. "npx", "uvx", "node", "docker"
    args TEXT,                                    -- JSON array of string arguments
    cwd TEXT,                                     -- Working directory for the process

    -- HTTP/SSE transport fields
    url TEXT,                                     -- e.g. "https://mcp.supabase.com/sse"
    headers TEXT,                                 -- JSON object of HTTP headers

    -- Environment variables (stored encrypted)
    env_vars TEXT,                                -- JSON object: {"API_KEY": "encrypted:..."}

    -- Metadata
    source TEXT CHECK (source IN ('manual', 'imported', 'registry')),
    source_client TEXT,                           -- If imported, which client it came from
    registry_id TEXT,                             -- If from registry, the registry server ID
    repository_url TEXT,                          -- GitHub/GitLab URL
    npm_package TEXT,                             -- NPM package name if applicable
    pypi_package TEXT,                            -- PyPI package name if applicable
    docker_image TEXT,                            -- Docker image if applicable
    version TEXT,                                 -- Known version
    tags TEXT,                                    -- JSON array of tags for categorization

    -- State
    enabled INTEGER NOT NULL DEFAULT 1,           -- 1=active, 0=disabled
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which clients should receive this server's config
CREATE TABLE IF NOT EXISTS server_clients (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    client TEXT NOT NULL CHECK (client IN (
        'claude-desktop', 'cursor', 'vscode', 'claude-code',
        'cline', 'windsurf', 'continue', 'zed'
    )),
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (server_id, client)
);

-- Named profiles for grouping servers
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,                    -- e.g. "work", "personal", "team-shared"
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Profile-to-server many-to-many
CREATE TABLE IF NOT EXISTS profile_servers (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    PRIMARY KEY (profile_id, server_id)
);

-- Track export history
CREATE TABLE IF NOT EXISTS export_history (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    client TEXT NOT NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    config_hash TEXT NOT NULL,                    -- SHA-256 of exported config
    config_snapshot TEXT NOT NULL,                -- Full exported JSON
    file_path TEXT NOT NULL,                      -- Where it was written
    exported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_servers_name ON servers(name);
CREATE INDEX idx_servers_transport ON servers(transport);
CREATE INDEX idx_servers_enabled ON servers(enabled);
CREATE INDEX idx_server_clients_client ON server_clients(client);
CREATE INDEX idx_export_history_client ON export_history(client);
```

### 7.3 Migration 002: Health Checks

```sql
-- 002_health_checks.sql

CREATE TABLE IF NOT EXISTS health_checks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'degraded', 'unknown', 'timeout')),
    response_time_ms INTEGER,                    -- Round-trip time in milliseconds
    protocol_version TEXT,                       -- MCP protocol version reported
    server_name TEXT,                            -- Server's self-reported name
    server_version TEXT,                         -- Server's self-reported version
    tools_discovered TEXT,                       -- JSON array of tool descriptors
    resources_discovered TEXT,                   -- JSON array of resource descriptors
    prompts_discovered TEXT,                     -- JSON array of prompt descriptors
    capabilities TEXT,                           -- JSON object of server capabilities
    error_message TEXT,                          -- Error details if unhealthy
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Only keep last 100 checks per server
CREATE INDEX idx_health_checks_server ON health_checks(server_id, checked_at DESC);
```

### 7.4 Migration 003: Audit Results

```sql
-- 003_audit_results.sql

CREATE TABLE IF NOT EXISTS audit_runs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    scope TEXT NOT NULL CHECK (scope IN ('all', 'server', 'profile')),
    target_id TEXT,                               -- server_id or profile_id, null if 'all'
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
    rule_id TEXT NOT NULL,                        -- e.g. "SEC-001"
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    remediation TEXT,                             -- How to fix it
    evidence TEXT,                                -- What triggered the finding (redacted)
    found_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_findings_run ON audit_findings(run_id);
CREATE INDEX idx_audit_findings_server ON audit_findings(server_id);
CREATE INDEX idx_audit_findings_severity ON audit_findings(severity);
```

### 7.5 Zod Schemas (TypeScript)

All database rows are validated through Zod schemas on read and write. Define these in `packages/core/src/inventory/types.ts`:

```typescript
import { z } from 'zod';

export const TransportType = z.enum(['stdio', 'sse', 'streamable-http']);
export type TransportType = z.infer<typeof TransportType>;

export const ClientType = z.enum([
  'claude-desktop', 'cursor', 'vscode', 'claude-code',
  'cline', 'windsurf', 'continue', 'zed'
]);
export type ClientType = z.infer<typeof ClientType>;

export const ServerSource = z.enum(['manual', 'imported', 'registry']);
export type ServerSource = z.infer<typeof ServerSource>;

export const McpServerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/i, 
    'Name must start with alphanumeric and contain only alphanumeric, dots, hyphens, underscores'),
  displayName: z.string().optional(),
  description: z.string().optional(),
  transport: TransportType,

  // STDIO fields
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),

  // HTTP/SSE fields
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),

  // Env vars
  envVars: z.record(z.string()).optional(),

  // Metadata
  source: ServerSource,
  sourceClient: ClientType.optional(),
  registryId: z.string().optional(),
  repositoryUrl: z.string().url().optional(),
  npmPackage: z.string().optional(),
  pypiPackage: z.string().optional(),
  dockerImage: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),

  // State
  enabled: z.boolean(),
  clients: z.array(z.object({
    client: ClientType,
    enabled: z.boolean(),
  })),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).refine(
  (data) => {
    if (data.transport === 'stdio') return !!data.command;
    if (data.transport === 'sse' || data.transport === 'streamable-http') return !!data.url;
    return true;
  },
  { message: 'STDIO servers require a command; HTTP/SSE servers require a URL' }
);

export type McpServer = z.infer<typeof McpServerSchema>;

export const CreateServerInput = McpServerSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateServerInput = z.infer<typeof CreateServerInput>;

export const UpdateServerInput = CreateServerInput.partial();
export type UpdateServerInput = z.infer<typeof UpdateServerInput>;
```

---

## 8. Core Module: Server Inventory

### 8.1 Inventory Manager API

File: `packages/core/src/inventory/inventory.ts`

The inventory manager is the central CRUD interface for MCP servers. Every method is synchronous (using `better-sqlite3`).

```typescript
export class InventoryManager {
  constructor(db: Database) {}

  // CRUD
  create(input: CreateServerInput): McpServer;
  getById(id: string): McpServer | null;
  getByName(name: string): McpServer | null;
  list(options?: ListOptions): McpServer[];
  update(id: string, input: UpdateServerInput): McpServer;
  delete(id: string): void;
  
  // Bulk operations
  enableAll(client: ClientType): void;
  disableAll(client: ClientType): void;
  setClientEnabled(serverId: string, client: ClientType, enabled: boolean): void;

  // Profile operations
  createProfile(name: string, description?: string): Profile;
  listProfiles(): Profile[];
  addToProfile(profileId: string, serverId: string): void;
  removeFromProfile(profileId: string, serverId: string): void;
  getServersInProfile(profileId: string): McpServer[];
  setDefaultProfile(profileId: string): void;

  // Import from existing client configs
  importFromClient(client: ClientType): ImportResult;
  importFromFile(filePath: string, client: ClientType): ImportResult;
  
  // Export helpers
  getServersForClient(client: ClientType, profileId?: string): McpServer[];
}

interface ListOptions {
  transport?: TransportType;
  client?: ClientType;
  enabled?: boolean;
  profileId?: string;
  search?: string;           // Fuzzy search across name, displayName, description
  tags?: string[];
  source?: ServerSource;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface ImportResult {
  imported: number;
  skipped: number;           // Already existed (by name match)
  errors: Array<{ name: string; error: string }>;
  servers: McpServer[];
}
```

### 8.2 Import Logic

The import function reads an existing client config file, parses it according to the client's schema, and upserts servers into the inventory. Key behavior:

1. **Detect config file location** using OS-specific path resolution (see `utils/paths.ts`).
2. **Parse the JSON** and extract the server entries from the client-specific key structure.
3. **For each server entry**:
   - Derive `name` from the JSON key (e.g., `"github"` from `mcpServers.github`).
   - Detect `transport` from the presence of `command` (STDIO) vs `url` (SSE/HTTP).
   - Map fields to the canonical `McpServer` schema.
   - Check if a server with the same name already exists. If so, skip (do not overwrite).
   - Insert into the database with `source: 'imported'` and `sourceClient` set to the importing client.
   - Add a `server_clients` row for the source client, enabled.

4. **Handle environment variables**: If the imported config has an `env` block, store its keys. For values that look like they contain actual secrets (API keys, tokens), mark them as needing review. Never store plaintext secrets from imports without user confirmation — instead, store the key name and flag for manual entry.

---

## 9. Core Module: Config Export Engine

### 9.1 Export Orchestrator

File: `packages/core/src/exporter/exporter.ts`

```typescript
export class ConfigExporter {
  constructor(private inventory: InventoryManager) {}

  /**
   * Export config for a specific client.
   * Returns the generated JSON string and the target file path.
   */
  export(client: ClientType, options?: ExportOptions): ExportResult;

  /**
   * Export configs for ALL clients simultaneously.
   */
  exportAll(options?: ExportOptions): Map<ClientType, ExportResult>;

  /**
   * Preview what would change without writing to disk.
   * Returns a diff between current file content and generated content.
   */
  preview(client: ClientType, options?: ExportOptions): ExportPreview;

  /**
   * Write the exported config to disk.
   * Creates a backup of the existing file first.
   */
  write(client: ClientType, result: ExportResult): WriteResult;

  /**
   * Write all exported configs to disk.
   */
  writeAll(results: Map<ClientType, ExportResult>): Map<ClientType, WriteResult>;
}

interface ExportOptions {
  profileId?: string;        // Only export servers in this profile
  onlyEnabled?: boolean;     // Default true — skip disabled servers
  dryRun?: boolean;          // Default false — don't write, just generate
  backup?: boolean;          // Default true — backup existing config before overwrite
  merge?: boolean;           // Default true — merge with existing config (preserve non-MCP settings)
}

interface ExportResult {
  client: ClientType;
  configJson: string;        // The generated JSON string
  filePath: string;          // Where it would be written
  serverCount: number;       // How many servers are in this export
  hash: string;              // SHA-256 of configJson
}

interface ExportPreview {
  client: ClientType;
  currentContent: string | null;   // Current file content (null if file doesn't exist)
  generatedContent: string;
  diff: string;                     // Unified diff format
  hasChanges: boolean;
}

interface WriteResult {
  client: ClientType;
  filePath: string;
  backupPath: string | null;        // Path to backup file
  written: boolean;
  error?: string;
}
```

### 9.2 Client-Specific Exporters

Each client has its own exporter module that transforms the canonical `McpServer[]` into the client's expected JSON format. These are pure functions with no side effects.

#### Claude Desktop Exporter (`claude-desktop.ts`)

```typescript
export function generateClaudeDesktopConfig(servers: McpServer[]): object {
  const mcpServers: Record<string, any> = {};
  
  for (const server of servers) {
    if (server.transport === 'stdio') {
      mcpServers[server.name] = {
        command: server.command,
        args: server.args ?? [],
        ...(server.envVars && Object.keys(server.envVars).length > 0 && { env: server.envVars }),
      };
    } else if (server.transport === 'sse' || server.transport === 'streamable-http') {
      mcpServers[server.name] = {
        url: server.url,
        ...(server.headers && Object.keys(server.headers).length > 0 && { headers: server.headers }),
      };
    }
  }

  return { mcpServers };
}
```

**Config file path resolution**:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Merge behavior**: The Claude Desktop config file may contain non-MCP settings. When `merge: true`, read the existing file, replace only the `mcpServers` key, and preserve everything else.

#### Cursor Exporter (`cursor.ts`)

Same schema as Claude Desktop (`mcpServers` at the top level), but different file path:
- All platforms: `~/.cursor/mcp.json`

#### VS Code Exporter (`vscode.ts`)

VS Code wraps servers under `{"mcp": {"servers": {...}}}`:

```typescript
export function generateVSCodeConfig(servers: McpServer[]): object {
  const serverEntries: Record<string, any> = {};

  for (const server of servers) {
    if (server.transport === 'stdio') {
      serverEntries[server.name] = {
        type: 'stdio',
        command: server.command,
        args: server.args ?? [],
        ...(server.envVars && { env: server.envVars }),
      };
    } else {
      serverEntries[server.name] = {
        type: 'sse',
        url: server.url,
        ...(server.headers && { headers: server.headers }),
      };
    }
  }

  return {
    mcp: {
      servers: serverEntries
    }
  };
}
```

**Config file paths**:
- Workspace: `.vscode/mcp.json` (preferred for workspace-level)
- User-level macOS: `~/Library/Application Support/Code/User/settings.json`
- User-level Windows: `%APPDATA%\Code\User\settings.json`
- User-level Linux: `~/.config/Code/User/settings.json`

**Merge behavior**: When merging into `settings.json`, only touch `mcp.servers` — preserve all other VS Code settings. When writing to `.vscode/mcp.json`, replace the entire file.

#### Claude Code Exporter (`claude-code.ts`)

Claude Code reads from `~/.claude/settings.json`. The MCP servers live under the `mcpServers` key. Same schema as Claude Desktop.

**Config file path**: `~/.claude/settings.json` on all platforms.

**Merge behavior**: Preserve all non-`mcpServers` keys in the settings file (permissions, environment variables, etc.).

#### Cline Exporter (`cline.ts`)

Same schema as Claude Desktop. Config file path:
- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

#### Windsurf Exporter (`windsurf.ts`)

Same schema as Claude Desktop. Config file path: `~/.windsurf/mcp.json`

#### Continue Exporter (`continue.ts`)

The `mcpServers` key lives inside Continue's broader config. Config file path: `~/.continue/config.json`

**Merge behavior**: Critical — Continue's config has many other settings. Only touch `mcpServers`.

#### Zed Exporter (`zed.ts`)

Zed uses a completely different schema with `context_servers` instead of `mcpServers`:

```typescript
export function generateZedConfig(servers: McpServer[]): object {
  const contextServers: Record<string, any> = {};

  for (const server of servers) {
    if (server.transport === 'stdio') {
      contextServers[server.name] = {
        command: server.command,
        args: server.args ?? [],
        ...(server.envVars && { env: server.envVars }),
      };
    }
    // Zed's SSE support may differ — check Zed docs for latest schema
  }

  return { context_servers: contextServers };
}
```

**Config file path**: `~/.config/zed/settings.json`

**Merge behavior**: Only touch `context_servers` — preserve all other Zed settings.

---

## 10. Core Module: Health Checker

### 10.1 Health Check Orchestrator

File: `packages/core/src/health/checker.ts`

The health checker connects to MCP servers, performs a protocol-level handshake, discovers tools/resources/prompts, and records results.

```typescript
export class HealthChecker {
  constructor(
    private db: Database,
    private options?: HealthCheckOptions
  ) {}

  /**
   * Check a single server's health.
   */
  async check(server: McpServer): Promise<HealthCheckResult>;

  /**
   * Check all servers (optionally filtered).
   */
  async checkAll(options?: { profileId?: string; concurrency?: number }): Promise<HealthCheckResult[]>;

  /**
   * Get the latest health status for a server.
   */
  getLatestStatus(serverId: string): HealthCheckResult | null;

  /**
   * Get health history for a server.
   */
  getHistory(serverId: string, limit?: number): HealthCheckResult[];

  /**
   * Prune old health check records (keep last N per server).
   */
  prune(keepPerServer?: number): number;
}

interface HealthCheckOptions {
  timeoutMs?: number;         // Default 10000 (10 seconds)
  concurrency?: number;       // Default 5
  discoverTools?: boolean;    // Default true — enumerate tools
  discoverResources?: boolean; // Default true
  discoverPrompts?: boolean;  // Default true
}

interface HealthCheckResult {
  serverId: string;
  serverName: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown' | 'timeout';
  responseTimeMs: number;
  protocolVersion?: string;
  serverInfo?: {
    name: string;
    version: string;
  };
  capabilities?: Record<string, any>;
  tools?: ToolDescriptor[];
  resources?: ResourceDescriptor[];
  prompts?: PromptDescriptor[];
  error?: string;
  checkedAt: string;
}

interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: object;       // JSON Schema
}

interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface PromptDescriptor {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}
```

### 10.2 STDIO Server Probing

File: `packages/core/src/health/stdio-probe.ts`

For STDIO-based servers, the health checker must:

1. **Spawn the server process** using the `command` and `args` from the server config.
2. **Send an MCP `initialize` request** over stdin as a JSON-RPC 2.0 message:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "2025-11-25",
       "capabilities": {},
       "clientInfo": {
         "name": "mcpman-health-checker",
         "version": "1.0.0"
       }
     }
   }
   ```
3. **Read the response** from stdout. Parse the JSON-RPC response to get server capabilities.
4. **Send `initialized` notification**:
   ```json
   { "jsonrpc": "2.0", "method": "notifications/initialized" }
   ```
5. **Discover tools** by sending `tools/list`:
   ```json
   { "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
   ```
6. **Discover resources** by sending `resources/list`:
   ```json
   { "jsonrpc": "2.0", "id": 3, "method": "resources/list" }
   ```
7. **Discover prompts** by sending `prompts/list`:
   ```json
   { "jsonrpc": "2.0", "id": 4, "method": "prompts/list" }
   ```
8. **Send shutdown** and kill the process.
9. **Record results** including response time, discovered capabilities, and any errors.

Edge cases to handle:
- Process fails to start (command not found, permission denied)
- Process starts but produces no output within timeout
- Process outputs non-JSON data (stderr for errors)
- Process hangs during initialization
- Server doesn't support `tools/list` (older protocol version)

### 10.3 HTTP/SSE Server Probing

File: `packages/core/src/health/http-probe.ts`

For HTTP/SSE-based servers:

1. **Send an HTTP request** to the server's URL.
2. For SSE endpoints, establish an EventSource connection.
3. Send the same `initialize` JSON-RPC message as with STDIO.
4. Follow the same discovery flow as STDIO.
5. Close the connection.

Handle:
- TLS certificate errors (record as a security finding, still attempt connection)
- HTTP authentication (use headers from config)
- Connection refused, DNS resolution failure
- SSE connection drops

---

## 11. Core Module: Security Auditor

### 11.1 Audit Orchestrator

File: `packages/core/src/security/auditor.ts`

```typescript
export class SecurityAuditor {
  constructor(
    private db: Database,
    private inventory: InventoryManager,
    private rules: AuditRule[]
  ) {}

  /**
   * Run all audit rules against all servers (or a subset).
   */
  async audit(options?: AuditOptions): Promise<AuditRun>;

  /**
   * Run audit on a single server.
   */
  async auditServer(serverId: string): Promise<AuditFinding[]>;

  /**
   * Get the latest audit run.
   */
  getLatestRun(): AuditRun | null;

  /**
   * Get findings for a specific run.
   */
  getFindings(runId: string): AuditFinding[];

  /**
   * Get all findings for a server across all runs.
   */
  getServerFindings(serverId: string): AuditFinding[];
}

interface AuditOptions {
  profileId?: string;
  serverIds?: string[];
  ruleIds?: string[];          // Only run specific rules
  severity?: AuditSeverity[];  // Only report above threshold
}

interface AuditRule {
  id: string;                  // e.g. "SEC-001"
  name: string;
  description: string;
  severity: AuditSeverity;
  check(server: McpServer, context: AuditContext): AuditFinding | null;
}

type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface AuditContext {
  allServers: McpServer[];
  healthResults?: Map<string, HealthCheckResult>;
  configFiles: Map<ClientType, string>;   // Current config file contents
}

interface AuditFinding {
  ruleId: string;
  serverId: string;
  severity: AuditSeverity;
  title: string;
  description: string;
  remediation: string;
  evidence?: string;           // Redacted evidence (never expose full secrets)
}
```

### 11.2 Audit Rules

Each rule is a separate file in `packages/core/src/security/rules/`. Implement these rules:

#### SEC-001: Hardcoded Secrets in Config (`hardcoded-secrets.ts`)

**Severity**: Critical

Scans `env_vars` values, `args`, and `headers` for patterns that look like secrets:
- API keys (long alphanumeric strings, strings starting with `sk-`, `pk-`, `ghp_`, `gho_`, `xoxb-`, `xoxp-`, etc.)
- Bearer tokens in headers
- Database connection strings with passwords
- AWS access keys (pattern: `AKIA[0-9A-Z]{16}`)
- Generic high-entropy strings (Shannon entropy > 4.5 for strings > 20 chars)

**Evidence**: Show only the first 4 and last 4 characters: `sk-ab...xy1z`

**Remediation**: "Move this value to an environment variable referenced by name. Use a `.env` file or your OS keychain for the actual secret value. Never store plaintext secrets in MCP config files."

#### SEC-002: Plaintext Transport for Remote Servers (`transport-security.ts`)

**Severity**: High

Flags servers with `transport: 'sse'` or `transport: 'streamable-http'` where the URL uses `http://` instead of `https://`, excluding `localhost` and `127.0.0.1`.

**Remediation**: "Switch to HTTPS. If the server doesn't support TLS, consider running it behind a reverse proxy with TLS termination."

#### SEC-003: Environment Variable Exposure (`env-var-exposure.ts`)

**Severity**: Medium

Scans the actual client config files on disk (not the mcpman database) for env var values that appear to contain secrets. This catches configs that were edited manually and bypassed mcpman.

Also checks if any config files are world-readable (file permissions on Unix).

**Remediation**: "Restrict file permissions to owner-only: `chmod 600 <config-file>`."

#### SEC-004: Overly Broad Permission Scope (`permission-scope.ts`)

**Severity**: Medium

If health check data is available, examines the tools a server exposes. Flags servers that expose filesystem-write, shell-execute, or network-access tools without documentation or clear scoping.

High-risk tool patterns:
- Tools named `exec`, `shell`, `run_command`, `bash`, `execute`
- Tools with `write`, `delete`, `remove` in their name plus filesystem paths in input schema
- Tools that accept arbitrary URLs as input (potential SSRF)

**Remediation**: "Review this server's tools carefully. Consider sandboxing with Docker or restricting the server's filesystem access."

#### SEC-005: Dependency Vulnerability Check (`dependency-check.ts`)

**Severity**: Low

For servers installed via npm (`npx` command), checks if the npm package has known vulnerabilities. Uses the npm registry API to check for advisories.

For servers with a `repository_url`, checks if the repository has security advisories on GitHub.

**Remediation**: "Update the server package to the latest version. Check the server's repository for security advisories."

#### SEC-006: Missing Authentication for Remote Servers (`transport-security.ts`)

**Severity**: High

Flags remote servers (non-localhost SSE/HTTP) that have no `headers` configured containing `Authorization`, `X-API-Key`, or similar authentication headers.

**Remediation**: "Remote MCP servers should require authentication. Add an Authorization header or API key to prevent unauthorized access to your server's tools."

#### SEC-007: Docker Socket Exposure (`hardcoded-secrets.ts`)

**Severity**: Critical

Flags servers that mount the Docker socket (`/var/run/docker.sock`) in their args, as this grants full host access.

**Remediation**: "Avoid mounting the Docker socket. Use Docker-in-Docker or rootless Docker instead."

---

## 12. Core Module: Community Registry Browser

### 12.1 Registry Client

File: `packages/core/src/registry/client.ts`

The registry client communicates with the official MCP Registry API at `https://registry.modelcontextprotocol.io`.

```typescript
export class RegistryClient {
  private baseUrl = 'https://registry.modelcontextprotocol.io';

  /**
   * Search for servers in the registry.
   */
  async search(query: string, options?: RegistrySearchOptions): Promise<RegistrySearchResult>;

  /**
   * Get a specific server's details.
   */
  async getServer(name: string): Promise<RegistryServer | null>;

  /**
   * List all servers (paginated).
   */
  async list(options?: RegistryListOptions): Promise<RegistrySearchResult>;

  /**
   * Refresh the local cache from the registry.
   */
  async refreshCache(): Promise<CacheRefreshResult>;
}

interface RegistrySearchOptions {
  limit?: number;              // Default 20, max 100
  cursor?: string;             // Pagination cursor
}

interface RegistryListOptions {
  limit?: number;
  cursor?: string;
}

interface RegistrySearchResult {
  servers: RegistryServer[];
  nextCursor?: string;
  totalCount?: number;
}

interface RegistryServer {
  name: string;                // e.g. "io.github.user/server-name"
  description: string;
  version: string;
  repository: {
    url: string;
    source: string;            // "github", "gitlab", etc.
  };
  packages?: Array<{
    registry: string;          // "npm", "pypi", "docker"
    name: string;
    version?: string;
  }>;
  remotes?: Array<{
    transportType: string;     // "sse", "streamable-http"
    url: string;
  }>;
  meta?: {
    status: string;
    publishedAt: string;
    updatedAt: string;
  };
}
```

### 12.2 Registry Cache

File: `packages/core/src/registry/cache.ts`

The registry cache is a separate SQLite database at `~/.mcpman/registry-cache.db`. It stores a local copy of registry data to enable offline browsing and fast search.

```sql
-- registry_cache schema
CREATE TABLE IF NOT EXISTS registry_servers (
    name TEXT PRIMARY KEY,
    description TEXT,
    version TEXT,
    repository_url TEXT,
    repository_source TEXT,
    packages TEXT,              -- JSON array
    remotes TEXT,               -- JSON array
    meta TEXT,                  -- JSON object
    raw_data TEXT,              -- Full JSON for future-proofing
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_registry_description ON registry_servers(description);
```

Cache behavior:
- Refresh on `mcpman registry search` if cache is older than 24 hours (configurable).
- Manual refresh with `mcpman registry refresh`.
- Full-text search on name and description using SQLite FTS5 (create a virtual table).

### 12.3 Install from Registry

When a user finds a server in the registry and wants to install it:

1. Fetch full details from the registry.
2. Determine transport type:
   - If the registry server has `remotes`, default to SSE/HTTP transport.
   - If the registry server has npm/pypi packages, default to STDIO with `npx`/`uvx`.
3. Present the user with a pre-filled `CreateServerInput` for review.
4. Prompt for any required environment variables (API keys, tokens).
5. Insert into the local inventory.
6. Optionally run a health check immediately.
7. Optionally export to selected clients immediately.

---

## 13. CLI Application

### 13.1 Command Structure

The CLI binary is `mcpman`. It is installed globally via `npm install -g mcpman`.

```
mcpman <command> [subcommand] [options]

Commands:
  mcpman add [name]              Add an MCP server to the inventory
  mcpman remove <name>           Remove an MCP server
  mcpman list                    List all servers in the inventory
  mcpman edit <name>             Edit a server's configuration
  mcpman enable <name>           Enable a server
  mcpman disable <name>          Disable a server
  mcpman export [client]         Export config to client(s)
  mcpman import [client]         Import servers from a client's config
  mcpman health [name]           Run health checks
  mcpman audit [name]            Run security audit
  mcpman registry <subcommand>   Browse and install from the MCP Registry
  mcpman profile <subcommand>    Manage server profiles
  mcpman doctor                  Diagnose common issues
  mcpman config <subcommand>     Manage mcpman settings
  mcpman ui                      Start the web UI

Global Options:
  --format <format>              Output format: table, json, yaml (default: table)
  --quiet                        Suppress non-essential output
  --verbose                      Show detailed output
  --version                      Show version
  --help                         Show help
```

### 13.2 Command Details

#### `mcpman add [name]`

Adds a new MCP server to the inventory. Two modes:

**Interactive mode** (no name provided or with `--interactive`):
```
$ mcpman add
? Server name: github
? Display name (optional): GitHub MCP Server
? Transport type: (Use arrow keys)
  ❯ stdio (local process)
    sse (Server-Sent Events)
    streamable-http (HTTP streaming)
? Command: npx
? Arguments (comma-separated): -y,@modelcontextprotocol/server-github
? Environment variables (key=value, comma-separated): GITHUB_PERSONAL_ACCESS_TOKEN=
? Which clients should receive this server? (Use space to select)
  ❯◉ claude-desktop
   ◉ cursor
   ◉ vscode
   ◯ claude-code
   ◯ cline
   ◯ windsurf
   ◯ continue
   ◯ zed
? Tags (comma-separated, optional): github,vcs,code

✓ Server "github" added successfully.
  Enabled for: claude-desktop, cursor, vscode
  Run 'mcpman export' to update client configs.
```

**Direct mode** (all options via flags):
```
mcpman add github \
  --transport stdio \
  --command npx \
  --args "-y,@modelcontextprotocol/server-github" \
  --env "GITHUB_PERSONAL_ACCESS_TOKEN=" \
  --clients "claude-desktop,cursor,vscode" \
  --tags "github,vcs"
```

**Flags**:
- `--transport <type>`: stdio, sse, streamable-http
- `--command <cmd>`: Command for STDIO servers
- `--args <args>`: Comma-separated arguments
- `--url <url>`: URL for SSE/HTTP servers
- `--header <key=value>`: HTTP header (repeatable)
- `--env <key=value>`: Environment variable (repeatable)
- `--clients <clients>`: Comma-separated client list
- `--tags <tags>`: Comma-separated tags
- `--description <desc>`: Server description
- `--from-registry <name>`: Pre-fill from a registry server
- `--no-interactive`: Skip all prompts, fail on missing required fields

#### `mcpman remove <name>`

```
$ mcpman remove github
? Are you sure you want to remove "github"? (y/N) y
✓ Server "github" removed.
  Run 'mcpman export' to update client configs.
```

Flags:
- `--force`: Skip confirmation
- `--and-export`: Also export to all affected clients immediately

#### `mcpman list`

```
$ mcpman list
┌──────────┬────────────────────────┬───────────┬──────────┬────────────────────────────┐
│ Name     │ Display Name           │ Transport │ Status   │ Clients                    │
├──────────┼────────────────────────┼───────────┼──────────┼────────────────────────────┤
│ github   │ GitHub MCP Server      │ stdio     │ enabled  │ claude-desktop, cursor, vs │
│ postgres │ PostgreSQL MCP         │ stdio     │ enabled  │ claude-desktop, cursor     │
│ supabase │ Supabase MCP           │ sse       │ enabled  │ all                        │
│ slack    │ Slack Integration      │ sse       │ disabled │ claude-desktop             │
└──────────┴────────────────────────┴───────────┴──────────┴────────────────────────────┘

4 servers (3 enabled, 1 disabled)
```

Flags:
- `--transport <type>`: Filter by transport
- `--client <client>`: Filter by client
- `--enabled` / `--disabled`: Filter by status
- `--profile <name>`: Filter by profile
- `--tags <tags>`: Filter by tags
- `--format json|yaml|table`: Output format

#### `mcpman export [client]`

```
# Export to a specific client
$ mcpman export claude-desktop
✓ Exported 3 servers to ~/Library/Application Support/Claude/claude_desktop_config.json
  Backup saved to ~/Library/Application Support/Claude/claude_desktop_config.json.bak

# Export to all clients
$ mcpman export --all
✓ claude-desktop: 3 servers → ~/Library/Application Support/Claude/claude_desktop_config.json
✓ cursor: 3 servers → ~/.cursor/mcp.json
✓ vscode: 2 servers → ~/.config/Code/User/settings.json
✓ claude-code: 3 servers → ~/.claude/settings.json
  4 configs updated.

# Preview without writing
$ mcpman export claude-desktop --dry-run
--- current
+++ generated
@@ -1,5 +1,12 @@
 {
-  "mcpServers": {}
+  "mcpServers": {
+    "github": {
+      "command": "npx",
+      "args": ["-y", "@modelcontextprotocol/server-github"],
+      "env": {
+        "GITHUB_PERSONAL_ACCESS_TOKEN": "..."
+      }
+    }
+  }
 }
```

Flags:
- `--all`: Export to all configured clients
- `--dry-run`: Preview changes without writing
- `--no-backup`: Don't create backup files
- `--no-merge`: Replace entire file instead of merging
- `--profile <name>`: Export only servers in this profile
- `--force`: Overwrite even if no changes detected

#### `mcpman import [client]`

```
# Import from a specific client
$ mcpman import claude-desktop
Found 5 servers in Claude Desktop config:
  ✓ github (new — added)
  ✓ postgres (new — added)
  ⊘ supabase (already exists — skipped)
  ✓ slack (new — added)
  ✗ broken-server (error: missing command field)

Imported 3 servers, skipped 1, errors 1.

# Import from all clients
$ mcpman import --all
Scanning all client configs...
  claude-desktop: found 5 servers
  cursor: found 3 servers (2 duplicates)
  vscode: found 1 server (1 duplicate)
Imported 6 unique servers total.
```

Flags:
- `--all`: Import from all detectable client configs
- `--file <path>`: Import from a specific file
- `--overwrite`: Overwrite existing servers instead of skipping
- `--dry-run`: Show what would be imported without doing it

#### `mcpman health [name]`

```
# Check all servers
$ mcpman health
Checking 4 servers...
┌──────────┬──────────┬──────────┬─────────────┬───────┬────────────┬──────────┐
│ Name     │ Status   │ Latency  │ Protocol    │ Tools │ Resources  │ Prompts  │
├──────────┼──────────┼──────────┼─────────────┼───────┼────────────┼──────────┤
│ github   │ ✓ healthy│ 245ms    │ 2025-11-25  │ 12    │ 3          │ 0        │
│ postgres │ ✓ healthy│ 89ms     │ 2025-11-25  │ 8     │ 0          │ 2        │
│ supabase │ ✓ healthy│ 312ms    │ 2025-11-25  │ 15    │ 5          │ 1        │
│ slack    │ ✗ error  │ timeout  │ —           │ —     │ —          │ —        │
└──────────┴──────────┴──────────┴─────────────┴───────┴────────────┴──────────┘

3 healthy, 1 unhealthy

# Check a specific server with tool details
$ mcpman health github --verbose
Server: github (GitHub MCP Server)
Status: ✓ healthy
Latency: 245ms
Protocol: 2025-11-25
Server Version: 1.2.3

Tools (12):
  • create_issue — Create a new issue in a repository
  • list_issues — List issues with filters
  • get_issue — Get details of a specific issue
  • create_pull_request — Create a new pull request
  ... (8 more)

Resources (3):
  • github://repos — List of repositories
  • github://user — Current user info
  • github://notifications — Recent notifications
```

Flags:
- `--verbose`: Show tool/resource/prompt details
- `--timeout <ms>`: Override default timeout (default 10000)
- `--json`: Output raw JSON results
- `--profile <name>`: Only check servers in profile
- `--watch`: Re-check every N seconds (default 30)

#### `mcpman audit [name]`

```
$ mcpman audit
Running security audit on 4 servers...

Security Audit Report
═══════════════════════

CRITICAL (1)
  SEC-001: Hardcoded API key in "github" server
    Evidence: GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_aB...xY1z"
    Fix: Move to an environment variable or OS keychain.

HIGH (2)
  SEC-002: Unencrypted transport for "staging-api" server
    URL: http://staging.example.com:3001/sse
    Fix: Switch to HTTPS.
  SEC-006: No authentication for "public-tools" server
    URL: https://tools.example.com/mcp
    Fix: Add an Authorization header.

MEDIUM (1)
  SEC-003: Config file world-readable
    File: ~/.cursor/mcp.json (permissions: 644)
    Fix: Run 'chmod 600 ~/.cursor/mcp.json'

Summary: 1 critical, 2 high, 1 medium, 0 low, 0 info
```

Flags:
- `--fix`: Attempt to auto-fix issues where possible (e.g., fix file permissions)
- `--severity <level>`: Only show findings at or above this severity
- `--json`: Output raw JSON
- `--profile <name>`: Only audit servers in profile

#### `mcpman registry <subcommand>`

```
# Search the registry
$ mcpman registry search "database"
┌─────────────────────────────────┬──────────────────────────────────────┬─────────┐
│ Name                            │ Description                          │ Version │
├─────────────────────────────────┼──────────────────────────────────────┼─────────┤
│ io.github.user/postgres-mcp     │ PostgreSQL database access           │ 2.1.0   │
│ io.github.user/mysql-mcp        │ MySQL database tools                 │ 1.3.0   │
│ io.github.user/sqlite-mcp       │ SQLite read/write operations         │ 0.9.0   │
└─────────────────────────────────┴──────────────────────────────────────┴─────────┘

# View details
$ mcpman registry info io.github.user/postgres-mcp
Name: io.github.user/postgres-mcp
Description: PostgreSQL database access and query tools
Version: 2.1.0
Repository: https://github.com/user/postgres-mcp
Packages:
  npm: @user/postgres-mcp
  docker: ghcr.io/user/postgres-mcp
Published: 2025-10-15

# Install from registry
$ mcpman registry install io.github.user/postgres-mcp
Installing "postgres-mcp" from the MCP Registry...
? Transport type: stdio (via npx)
? Environment variables needed:
  DATABASE_URL: postgres://localhost:5432/mydb
? Enable for which clients? claude-desktop, cursor
✓ Server "postgres-mcp" added to inventory.

# Refresh local cache
$ mcpman registry refresh
Refreshing registry cache...
✓ Cached 1,847 servers (23 new since last refresh)
```

Subcommands:
- `search <query>`: Search the registry
- `info <name>`: Show details for a specific server
- `install <name>`: Install a server from the registry into the inventory
- `refresh`: Refresh the local registry cache
- `browse`: Open the web UI's registry browser

#### `mcpman profile <subcommand>`

```
# Create a profile
$ mcpman profile create work --description "Work-related MCP servers"
✓ Profile "work" created.

# Add servers to a profile
$ mcpman profile add-server work github postgres
✓ Added github, postgres to profile "work".

# List profiles
$ mcpman profile list
┌──────────┬──────────────────────────┬─────────┬─────────┐
│ Name     │ Description              │ Servers │ Default │
├──────────┼──────────────────────────┼─────────┼─────────┤
│ default  │ Default profile          │ 4       │ ★       │
│ work     │ Work-related MCP servers │ 2       │         │
│ personal │ Personal tools           │ 3       │         │
└──────────┴──────────────────────────┴─────────┴─────────┘

# Export using a specific profile
$ mcpman export --all --profile work
```

Subcommands:
- `create <name>`: Create a new profile
- `delete <name>`: Delete a profile
- `list`: List all profiles
- `show <name>`: Show servers in a profile
- `add-server <profile> <server...>`: Add servers to a profile
- `remove-server <profile> <server...>`: Remove servers from a profile
- `set-default <name>`: Set the default profile

#### `mcpman doctor`

Diagnostic command that checks the overall health of the mcpman setup:

```
$ mcpman doctor
mcpman Doctor
═════════════

✓ Database: ~/.mcpman/mcpman.db (4 servers, 2 profiles)
✓ Node.js: v20.11.0 (>= 20 required)
✓ npx: available at /usr/local/bin/npx
✓ uvx: available at /usr/local/bin/uvx
✓ Docker: available at /usr/local/bin/docker

Client Configs:
  ✓ Claude Desktop: config found at ~/Library/Application Support/Claude/claude_desktop_config.json
  ✓ Cursor: config found at ~/.cursor/mcp.json
  ⚠ VS Code: no .vscode/mcp.json found (create with 'mcpman export vscode')
  ✓ Claude Code: config found at ~/.claude/settings.json
  ✗ Cline: extension not installed
  ✗ Windsurf: not installed

Sync Status:
  ⚠ Claude Desktop: config is 2 servers behind inventory (last export: 3 days ago)
  ✓ Cursor: in sync
  ✓ Claude Code: in sync

Issues Found: 1 warning
  ⚠ Claude Desktop config is out of sync. Run 'mcpman export claude-desktop' to update.
```

#### `mcpman config <subcommand>`

Manage mcpman's own settings:

```
# View all settings
$ mcpman config list

# Set a specific setting
$ mcpman config set registry.cache.ttl 86400
$ mcpman config set health.timeout 15000
$ mcpman config set export.backup true
$ mcpman config set export.merge true

# Get a specific setting
$ mcpman config get registry.cache.ttl
```

#### `mcpman ui`

Start the web UI:

```
$ mcpman ui
Starting mcpman web UI...
✓ Server running at http://localhost:3847
  Press Ctrl+C to stop.
```

Flags:
- `--port <port>`: Custom port (default 3847)
- `--host <host>`: Custom host (default localhost)
- `--open`: Open browser automatically

---

## 14. Web UI Application

### 14.1 Layout & Navigation

The web UI uses a sidebar navigation layout:

**Sidebar**:
- Dashboard (home icon)
- Servers (server icon) — main server inventory
- Export (download icon) — export configs
- Health (heart icon) — health dashboard
- Security (shield icon) — audit results
- Registry (globe icon) — browse community registry
- Profiles (folder icon) — manage profiles
- Settings (gear icon) — app settings

**Header**: App title, dark mode toggle, notification bell (for health alerts).

### 14.2 Page: Dashboard

The dashboard is the landing page. It shows:
- **Server count**: Total servers, enabled/disabled breakdown.
- **Health summary**: Pie chart or status bar showing healthy/unhealthy/unknown.
- **Security summary**: Count of findings by severity since last audit.
- **Sync status**: For each client, whether the config is in sync with the inventory.
- **Recent activity**: Last 10 actions (adds, exports, health checks).
- **Quick actions**: Buttons for "Add Server", "Export All", "Run Health Check", "Run Audit".

### 14.3 Page: Servers

A searchable, filterable, sortable data table showing all servers. Columns:
- Name (link to detail page)
- Transport (badge: stdio/sse/http)
- Status (enabled/disabled toggle)
- Health (last known: green/red/gray dot)
- Clients (list of enabled client badges)
- Tags
- Actions (edit, delete, health check)

**Bulk actions**: Select multiple rows, then "Enable", "Disable", "Delete", "Add to Profile", "Export".

### 14.4 Page: Add Server

A multi-step form wizard:
1. **Basic Info**: Name, display name, description.
2. **Transport**: Choose STDIO or SSE/HTTP, then fill in transport-specific fields.
3. **Environment Variables**: Key-value editor with "sensitive" toggle (masks value).
4. **Client Selection**: Checkboxes for which clients should receive this server.
5. **Tags & Profile**: Optional tags, optional profile assignment.
6. **Review & Confirm**: Summary of all entered data.

Pre-fill option: Paste a JSON block from an existing config, or select from registry search results.

### 14.5 Page: Server Detail

Shows full details for a single server, plus:
- **Health history**: Chart of response times over last 30 checks, current status.
- **Discovered tools/resources/prompts**: Full list with descriptions and input schemas.
- **Audit findings**: Any security findings for this server.
- **Export status**: Which clients have this server, and whether they're in sync.
- **Edit form**: Inline editing of all fields.

### 14.6 Page: Export

Two sections:
1. **Quick Export**: Grid of client cards. Each shows: client name, logo, config file path, server count, sync status, "Export" button. Click to export immediately.
2. **Diff Preview**: Select a client, see a side-by-side diff of current vs generated config. "Apply" button to write.

### 14.7 Page: Health Dashboard

- **Overview**: Grid of server health cards showing status, latency, tool count.
- **Controls**: "Check All" button, filter by status, auto-refresh toggle.
- **Detail Modal**: Click a server card to see full health details including discovered tools with their schemas.

### 14.8 Page: Security Audit

- **Run Audit** button (triggers a full audit).
- **Findings list**: Grouped by severity (Critical first), each with expandable details showing rule ID, affected server, evidence, and remediation steps.
- **History**: Dropdown to view previous audit runs.
- **Auto-fix**: Where possible, offer one-click fix buttons (e.g., fix file permissions).

### 14.9 Page: Registry Browser

- **Search bar**: Full-text search across registry server names and descriptions.
- **Results grid**: Cards showing server name, description, repository link, package info, install button.
- **Server detail**: Click to see full info, README excerpt, install options.
- **Install wizard**: When clicking "Install", pre-fill the Add Server form with registry data.

### 14.10 Page: Profiles

- **Profile list**: Cards showing profile name, description, server count, "Set Default" button.
- **Profile detail**: List of servers in the profile, drag-and-drop reordering, add/remove servers.
- **Export by profile**: Quick export button per profile.

### 14.11 Page: Settings

- **General**: mcpman data directory location, database stats.
- **Registry**: Cache TTL, registry API URL.
- **Health Checks**: Default timeout, concurrency, auto-prune settings.
- **Export**: Default backup behavior, merge behavior, default clients.
- **Security**: Encryption key management (for env var encryption at rest).
- **Advanced**: Reset database, export/import mcpman data, debug logging.

---

## 15. Configuration & Environment

### 15.1 mcpman Config File

Location: `~/.mcpman/config.json`

```json
{
  "version": 1,
  "registry": {
    "apiUrl": "https://registry.modelcontextprotocol.io",
    "cacheTtlSeconds": 86400,
    "maxCacheSize": 10000
  },
  "health": {
    "defaultTimeoutMs": 10000,
    "defaultConcurrency": 5,
    "pruneKeepPerServer": 100,
    "discoverTools": true,
    "discoverResources": true,
    "discoverPrompts": true
  },
  "export": {
    "backupEnabled": true,
    "mergeEnabled": true,
    "defaultClients": ["claude-desktop", "cursor", "vscode"]
  },
  "security": {
    "encryptionEnabled": true
  },
  "ui": {
    "defaultPort": 3847,
    "openBrowser": true,
    "theme": "system"
  },
  "clients": {
    "claude-desktop": {
      "configPath": null,
      "enabled": true
    },
    "cursor": {
      "configPath": null,
      "enabled": true
    },
    "vscode": {
      "configPath": null,
      "scope": "user",
      "enabled": true
    },
    "claude-code": {
      "configPath": null,
      "enabled": true
    },
    "cline": {
      "configPath": null,
      "enabled": true
    },
    "windsurf": {
      "configPath": null,
      "enabled": true
    },
    "continue": {
      "configPath": null,
      "enabled": true
    },
    "zed": {
      "configPath": null,
      "enabled": true
    }
  }
}
```

Each `configPath: null` means "use the OS-specific default path". Users can override with custom paths.

### 15.2 Environment Variables

```
MCPMAN_DATA_DIR        # Override data directory (default: ~/.mcpman)
MCPMAN_DB_PATH         # Override database path
MCPMAN_LOG_LEVEL       # debug, info, warn, error (default: info)
MCPMAN_REGISTRY_URL    # Override registry API URL
MCPMAN_NO_COLOR        # Disable terminal colors
MCPMAN_ENCRYPTION_KEY  # Master key for env var encryption (optional — derived from OS keychain if not set)
```

---

## 16. Authentication & Authorization

### 16.1 Local Security

mcpman is a local-first tool. There is no multi-user authentication. However:

- **Env var encryption**: Sensitive environment variable values stored in the database are encrypted using AES-256-GCM. The encryption key is derived from the OS keychain (macOS Keychain, Windows DPAPI, Linux Secret Service) when available, or from a user-provided key via `MCPMAN_ENCRYPTION_KEY`.
- **File permissions**: On Unix systems, `~/.mcpman/` and all its contents should be `700`/`600`. The CLI checks this on startup and warns if permissions are too open.
- **Web UI**: Runs on `localhost` only by default. No network-accessible API without explicit `--host 0.0.0.0` flag, which should print a prominent security warning.

### 16.2 Registry API Authentication

The official MCP Registry API is currently unauthenticated for read access. No auth is needed to search or list servers. If the registry adds authentication in the future, support an API key via `MCPMAN_REGISTRY_API_KEY` env var.

---

## 17. Testing Strategy

### 17.1 Unit Tests (Vitest)

Location: `packages/*/tests/`

Coverage targets: 80%+ line coverage for `@mcpman/core`.

Key test areas:
- **Inventory CRUD**: Create, read, update, delete servers and profiles. Edge cases: duplicate names, invalid transport combinations, empty fields.
- **Config Export**: For each client, verify generated JSON matches expected format. Test merge behavior with existing configs. Test backup creation.
- **Config Import**: Parse sample configs from each client. Handle malformed JSON, missing fields, extra fields.
- **Health Check**: Mock STDIO process spawning, mock HTTP responses. Test timeout handling, error parsing, tool discovery parsing.
- **Security Audit**: Each rule tested with both passing and failing examples. Verify evidence redaction. Test severity counting.
- **Registry Client**: Mock HTTP responses from the registry API. Test caching, search, pagination.
- **Path Resolution**: Test OS-specific config path detection for macOS, Linux, Windows.

### 17.2 Integration Tests

- **Database migrations**: Apply all migrations to an in-memory SQLite database, verify schema.
- **Import → Export round-trip**: Import a config from client A, export for client B, verify structure.
- **CLI smoke tests**: Run key commands with a test database and verify exit codes and output.

### 17.3 E2E Tests (Playwright)

- **Web UI**: Navigate through all pages, add a server via the wizard, export, view health results.
- **Registry browsing**: Search, view details, install a server.

### 17.4 Test Fixtures

Provide realistic sample config files for each client in `packages/core/tests/fixtures/`:
- `claude-desktop-config.json`: 5 sample servers (mix of STDIO and SSE)
- `cursor-config.json`: 3 sample servers
- `vscode-mcp.json`: 2 sample servers with the VS Code wrapper format
- `claude-code-settings.json`: Settings with mcpServers
- `zed-settings.json`: Zed format with context_servers
- `sample-servers.json`: Canonical test data for 10 diverse servers

---

## 18. Error Handling & Logging

### 18.1 Error Classes

Define custom error classes in `packages/core/src/utils/errors.ts`:

```typescript
export class McpmanError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'McpmanError';
  }
}

export class ServerNotFoundError extends McpmanError {
  constructor(identifier: string) {
    super(`Server not found: ${identifier}`, 'SERVER_NOT_FOUND');
  }
}

export class DuplicateServerError extends McpmanError {
  constructor(name: string) {
    super(`Server with name "${name}" already exists`, 'DUPLICATE_SERVER');
  }
}

export class ConfigFileError extends McpmanError {
  constructor(path: string, reason: string) {
    super(`Config file error at ${path}: ${reason}`, 'CONFIG_FILE_ERROR');
  }
}

export class HealthCheckError extends McpmanError {
  constructor(serverName: string, reason: string) {
    super(`Health check failed for "${serverName}": ${reason}`, 'HEALTH_CHECK_ERROR');
  }
}

export class RegistryError extends McpmanError {
  constructor(message: string) {
    super(message, 'REGISTRY_ERROR');
  }
}

export class ValidationError extends McpmanError {
  constructor(message: string, public issues: z.ZodIssue[]) {
    super(message, 'VALIDATION_ERROR');
  }
}
```

### 18.2 Logging

Use a simple structured logger (no heavy dependencies):

```typescript
// packages/core/src/utils/logger.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  constructor(private level: LogLevel = 'info') {}
  
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
}
```

The CLI sets log level from `--verbose` (debug) or `--quiet` (error) flags, or `MCPMAN_LOG_LEVEL` env var. Logs go to stderr so they don't interfere with JSON output to stdout.

---

## 19. Performance & Scalability

### 19.1 Performance Targets

- **CLI startup**: < 200ms to first output
- **Server list (100 servers)**: < 50ms
- **Config export (single client, 100 servers)**: < 100ms
- **Health check (single STDIO server)**: < timeout (default 10s)
- **Health check (10 servers, concurrent)**: < timeout + 2s
- **Registry search (cached)**: < 50ms
- **Registry search (network)**: < 2s
- **Security audit (100 servers)**: < 5s
- **Web UI page load**: < 500ms

### 19.2 Database Performance

- Use WAL mode for concurrent read/write: `PRAGMA journal_mode=WAL`
- Use `PRAGMA foreign_keys=ON` for referential integrity
- Keep health check history bounded (prune to last 100 per server)
- Use FTS5 for registry cache full-text search
- Index all frequently-queried columns (already defined in schema)

### 19.3 Network Performance

- Health checks run concurrently with configurable concurrency (default 5)
- Registry API requests include `Accept-Encoding: gzip`
- Registry cache avoids redundant network requests (TTL-based)

---

## 20. Deployment & Packaging

### 20.1 NPM Distribution

The primary distribution channel is npm:

```bash
npm install -g mcpman
```

This installs the `mcpman` CLI binary globally. The `@mcpman/core` package is bundled within; it's not published separately in Phase 1 (but the monorepo structure allows it later).

### 20.2 Package.json Configuration

Root `package.json`:
```json
{
  "name": "mcpman-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "dev": "turbo dev",
    "clean": "turbo clean"
  }
}
```

CLI `package.json`:
```json
{
  "name": "mcpman",
  "version": "0.1.0",
  "description": "MCP Configuration Manager & Server Registry",
  "bin": {
    "mcpman": "./dist/index.js"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "keywords": ["mcp", "model-context-protocol", "claude", "cursor", "vscode", "config-manager"],
  "license": "MIT",
  "dependencies": {
    "@mcpman/core": "workspace:*",
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.0",
    "inquirer": "^9.0.0",
    "update-notifier": "^7.0.0"
  }
}
```

### 20.3 Binary Optimization

Use `tsup` with the following config to produce a single bundled file:

```typescript
// packages/cli/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],           // Node.js requires CJS for bin scripts
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  noExternal: ['@mcpman/core'],  // Bundle core into the CLI
  external: ['better-sqlite3'],   // Native module — must be installed separately
});
```

### 20.4 Docker Image (Optional, Phase 2)

For the web UI, provide a Docker image:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY packages/web ./
RUN npm ci --production
EXPOSE 3847
CMD ["npm", "start"]
```

### 20.5 Homebrew Formula (Phase 3)

Create a Homebrew formula for easy installation on macOS:

```
brew install mcpman
```

---

## 21. Development Phases & Milestones

### Phase 1: Foundation (Weeks 1-3)

**Goal**: Core engine + CLI with basic CRUD and export.

Deliverables:
- [ ] Monorepo setup with npm workspaces, TypeScript, tsup, vitest
- [ ] SQLite database with Migration 001 (servers, profiles, export history)
- [ ] Inventory Manager: full CRUD, profile management
- [ ] Config Exporter: all 8 client exporters with merge logic
- [ ] Path resolution for all clients on macOS, Linux, Windows
- [ ] Import from existing client configs
- [ ] CLI commands: `add`, `remove`, `list`, `edit`, `enable`, `disable`, `export`, `import`, `doctor`, `config`
- [ ] Unit tests for inventory and exporter (80%+ coverage)
- [ ] `README.md` with installation and basic usage

**Acceptance criteria**: User can `mcpman import claude-desktop`, see their servers with `mcpman list`, add a new one with `mcpman add`, and `mcpman export --all` to sync all clients.

### Phase 2: Health & Security (Weeks 4-5)

**Goal**: Health checking and security auditing.

Deliverables:
- [ ] Migration 002 (health checks) and Migration 003 (audit results)
- [ ] Health Checker: STDIO probing, HTTP/SSE probing, tool discovery
- [ ] Security Auditor: all 7 rules (SEC-001 through SEC-007)
- [ ] CLI commands: `health`, `audit`
- [ ] Unit tests for health and security modules
- [ ] Documentation for security rules

**Acceptance criteria**: User can `mcpman health` to see all server statuses with discovered tools. `mcpman audit` produces a report flagging hardcoded secrets and insecure configs.

### Phase 3: Registry & Web UI (Weeks 6-8)

**Goal**: Community registry integration and web UI.

Deliverables:
- [ ] Registry Client: search, info, list, local cache with FTS5
- [ ] Install from registry flow
- [ ] CLI commands: `registry search`, `registry info`, `registry install`, `registry refresh`
- [ ] Web UI: all pages (dashboard, servers, export, health, audit, registry, profiles, settings)
- [ ] API routes (Next.js) wrapping `@mcpman/core`
- [ ] CLI command: `mcpman ui`
- [ ] E2E tests for web UI

**Acceptance criteria**: User can `mcpman registry search database`, find a PostgreSQL MCP server, install it, verify it with `mcpman health postgres`, audit it, and see everything in the web UI at `http://localhost:3847`.

### Phase 4: Polish & Distribution (Weeks 9-10)

**Goal**: Production-ready release.

Deliverables:
- [ ] Comprehensive error handling and edge case coverage
- [ ] `mcpman doctor` improvements
- [ ] Update notifier
- [ ] npm publish pipeline (GitHub Actions)
- [ ] Homebrew formula
- [ ] Docker image for web UI
- [ ] Full documentation site (or comprehensive README)
- [ ] CHANGELOG.md
- [ ] v1.0.0 release

---

## Appendix A: Client Config Format Reference

### Claude Desktop / Cursor / Cline / Windsurf / Claude Code

These all use the same top-level schema (with different file paths):

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "<executable>",
      "args": ["<arg1>", "<arg2>"],
      "env": {
        "<ENV_VAR>": "<value>"
      }
    },
    "<remote-server-name>": {
      "url": "https://example.com/sse",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

### VS Code (Copilot)

```json
{
  "mcp": {
    "servers": {
      "<server-name>": {
        "type": "stdio",
        "command": "<executable>",
        "args": ["<arg1>"],
        "env": {
          "<ENV_VAR>": "<value>"
        }
      },
      "<remote-server-name>": {
        "type": "sse",
        "url": "https://example.com/sse"
      }
    }
  }
}
```

### Zed

```json
{
  "context_servers": {
    "<server-name>": {
      "command": "<executable>",
      "args": ["<arg1>"],
      "env": {
        "<ENV_VAR>": "<value>"
      }
    }
  }
}
```

### Continue

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "<executable>",
      "args": ["<arg1>"],
      "env": {
        "<ENV_VAR>": "<value>"
      }
    }
  }
}
```

Note: Continue's config file contains many other settings. The `mcpServers` key is one of many top-level keys. Always merge, never replace the entire file.

---

## Appendix B: MCP Registry API Reference

Base URL: `https://registry.modelcontextprotocol.io`

### List Servers

```
GET /v0/servers?search=<query>&limit=<n>&cursor=<cursor>
```

Response:
```json
{
  "servers": [
    {
      "server": {
        "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json",
        "name": "io.github.user/server-name",
        "description": "Description of the server",
        "repository": {
          "url": "https://github.com/user/server-name",
          "source": "github"
        },
        "version": "1.0.0",
        "packages": [
          {
            "registry_name": "npm",
            "name": "@user/server-name",
            "version": "1.0.0"
          }
        ],
        "remotes": [
          {
            "transport_type": "sse",
            "url": "https://server.example.com/sse"
          }
        ]
      },
      "_meta": {
        "io.modelcontextprotocol.registry/official": {
          "status": "active",
          "publishedAt": "2025-09-16T00:00:00Z",
          "updatedAt": "2025-09-16T00:00:00Z",
          "isLatest": true
        }
      }
    }
  ],
  "next_cursor": "eyJ..."
}
```

### Get Single Server

```
GET /v0/servers/<name>
```

Returns a single server object (same structure as above without the array wrapper).

### API Notes

- The API is currently in v0 (preview) with an API freeze as of 2025-10-24.
- No authentication required for read access.
- Rate limiting may apply — handle 429 responses with exponential backoff.
- The registry is a metaregistry: it stores metadata, not actual code. Packages are fetched from npm, PyPI, Docker Hub, etc.

---

## Appendix C: Security Audit Rules

| Rule ID | Name | Severity | Description |
|---------|------|----------|-------------|
| SEC-001 | Hardcoded Secrets | Critical | Detects API keys, tokens, and high-entropy strings in config values |
| SEC-002 | Unencrypted Transport | High | Flags HTTP (non-HTTPS) URLs for remote servers |
| SEC-003 | Config File Permissions | Medium | Checks if config files are world-readable |
| SEC-004 | Overly Broad Permissions | Medium | Flags servers exposing dangerous tools (exec, shell, filesystem write) |
| SEC-005 | Dependency Vulnerabilities | Low | Checks npm packages for known security advisories |
| SEC-006 | Missing Authentication | High | Flags remote servers with no auth headers configured |
| SEC-007 | Docker Socket Exposure | Critical | Flags servers mounting /var/run/docker.sock |

### Secret Detection Patterns

```typescript
const SECRET_PATTERNS = [
  // AWS
  /AKIA[0-9A-Z]{16}/,
  // GitHub
  /gh[pousr]_[A-Za-z0-9_]{36,}/,
  // Slack
  /xox[bpors]-[0-9a-zA-Z-]+/,
  // Generic API key prefixes
  /^sk-[a-zA-Z0-9]{20,}/,
  /^pk-[a-zA-Z0-9]{20,}/,
  // Bearer tokens
  /^Bearer\s+[A-Za-z0-9._~+/=-]{20,}/,
  // Database URLs with passwords
  /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/,
  // Private keys
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  // JWT
  /^eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+/,
];

// Shannon entropy threshold for detecting random strings
const ENTROPY_THRESHOLD = 4.5;
const MIN_LENGTH_FOR_ENTROPY = 20;
```

---

## Appendix D: Glossary

| Term | Definition |
|------|------------|
| **MCP** | Model Context Protocol — an open protocol for connecting LLM applications to external data sources and tools |
| **MCP Server** | A service that provides tools, resources, and prompts to LLM clients via MCP |
| **MCP Client** | An application (Claude Desktop, Cursor, VS Code, etc.) that connects to MCP servers |
| **STDIO Transport** | MCP communication via stdin/stdout of a locally spawned process |
| **SSE Transport** | MCP communication via Server-Sent Events over HTTP |
| **Streamable HTTP** | MCP communication via HTTP streaming (newer transport option) |
| **Inventory** | mcpman's local database of configured MCP servers |
| **Profile** | A named group of servers for organizing and selectively exporting configs |
| **Config Export** | The process of generating a client-specific JSON config file from the inventory |
| **Config Import** | The process of reading an existing client config and adding its servers to the inventory |
| **Health Check** | Connecting to an MCP server, performing a protocol handshake, and discovering its capabilities |
| **Security Audit** | Scanning server configs and health data for security issues using predefined rules |
| **Registry** | The official MCP Registry at registry.modelcontextprotocol.io — a public catalog of MCP servers |
| **WAL Mode** | Write-Ahead Logging — SQLite journaling mode that allows concurrent reads during writes |
| **JSON-RPC 2.0** | The wire protocol used by MCP for client-server communication |

---

*End of specification. This document provides everything needed to implement mcpman from scratch using Claude Code.*
