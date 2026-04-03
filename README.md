# mcpman

A CLI tool that maintains a single inventory of MCP servers and exports correctly-formatted configurations for every major MCP client — with health-checking, security auditing, and community registry browsing.

## The Problem

Each MCP client (Claude Desktop, Cursor, VS Code, Claude Code, Cline, Windsurf, Continue, Zed) uses a slightly different config format and file path. Managing servers across multiple clients means hand-editing JSON files separately, which is painful, error-prone, and insecure.

**mcpman** provides one canonical source of truth for all your MCP server configurations.

## Supported Clients

| Client | Config Format |
|---|---|
| Claude Desktop | `mcpServers` in `claude_desktop_config.json` |
| Cursor | `mcpServers` in `~/.cursor/mcp.json` |
| VS Code (Copilot) | `mcp.servers` in `.vscode/mcp.json` |
| Claude Code | `mcpServers` in `~/.claude/settings.json` |
| Cline | `mcpServers` in Cline global storage |
| Windsurf | `mcpServers` in `~/.windsurf/mcp.json` |
| Continue | `mcpServers` in `~/.continue/config.json` |
| Zed | `context_servers` in `~/.config/zed/settings.json` |

## Prerequisites

- Node.js >= 20.0.0

## Installation

```bash
# Clone and build
git clone https://github.com/SpyrosAgr/mcp-manager.git
cd mcp-manager
npm install
npm run build

# Link the CLI globally
cd packages/cli
npm link
```

## Quick Start

```bash
# Import existing servers from a client
mcpman import claude-desktop

# Add a new server
mcpman add my-server --transport stdio --command npx --args my-mcp-server

# List all servers
mcpman list

# Export to all clients
mcpman export --all

# Run a health check
mcpman health

# Run a security audit
mcpman audit
```

## Commands

### `mcpman list`

List all servers in the inventory.

```bash
mcpman list
mcpman list --transport stdio
mcpman list --client cursor
mcpman list --enabled
mcpman list --profile my-profile
mcpman list --tags dev,tools
mcpman list --format json
```

### `mcpman add [name]`

Add an MCP server. Run without arguments for interactive mode.

```bash
# Interactive
mcpman add

# Non-interactive
mcpman add my-server \
  --transport stdio \
  --command npx \
  --args "@modelcontextprotocol/server-filesystem,/home/user/projects" \
  --env "API_KEY=sk-xxx" \
  --clients claude-desktop,cursor \
  --tags dev,filesystem
```

**Options:** `--transport`, `--command`, `--args`, `--url`, `--env`, `--header`, `--clients`, `--tags`, `--description`, `--no-interactive`

### `mcpman remove <name>`

Remove a server from the inventory.

```bash
mcpman remove my-server
mcpman remove my-server --force   # skip confirmation
```

### `mcpman edit <name>`

Edit a server's configuration.

```bash
mcpman edit my-server --description "Updated description"
mcpman edit my-server --command node --args "server.js"
mcpman edit my-server --clients claude-desktop,cursor,vscode
mcpman edit my-server --env "API_KEY=new-value"
```

### `mcpman enable <name>` / `mcpman disable <name>`

Toggle a server on or off without removing it.

```bash
mcpman enable my-server
mcpman disable my-server
```

### `mcpman export [client]`

Export configurations to one or all clients.

```bash
mcpman export claude-desktop
mcpman export --all
mcpman export --all --dry-run          # preview without writing
mcpman export cursor --no-backup       # skip backup
mcpman export --all --profile work     # export only servers in a profile
```

### `mcpman import [client]`

Import servers from existing client configs.

```bash
mcpman import claude-desktop
mcpman import --all                    # import from all detectable clients
mcpman import --file ./my-config.json  # import from a file
mcpman import cursor --dry-run         # preview what would be imported
```

### `mcpman health [name]`

Run health checks against your servers.

```bash
mcpman health                          # check all servers
mcpman health my-server                # check a specific server
mcpman health --verbose                # show tool/resource/prompt details
mcpman health --timeout 5000           # custom timeout in ms
mcpman health --json                   # JSON output
mcpman health --profile work
```

### `mcpman audit [name]`

Run a security audit.

```bash
mcpman audit                           # audit all servers
mcpman audit my-server
mcpman audit --severity high           # only high+ severity findings
mcpman audit --json
mcpman audit --profile production
```

### `mcpman doctor`

Diagnose common issues (database status, Node.js version, tool availability, client config paths).

```bash
mcpman doctor
```

### `mcpman profile`

Manage server profiles for grouping servers by context (e.g., work, personal, project).

```bash
mcpman profile list
mcpman profile create work --description "Work servers"
mcpman profile show work
mcpman profile add-server work my-server other-server
mcpman profile remove-server work other-server
mcpman profile set-default work
mcpman profile delete old-profile --force
```

### `mcpman registry`

Browse and install from the MCP community registry.

```bash
mcpman registry search filesystem
mcpman registry search "web scraping" --limit 5
mcpman registry info server-name
mcpman registry install server-name --clients claude-desktop,cursor
mcpman registry refresh                # refresh local cache
```

### `mcpman config`

Manage mcpman's own settings.

```bash
mcpman config list
mcpman config get defaultClients
mcpman config set defaultClients "claude-desktop,cursor"
```

## Project Structure

This is a monorepo with three packages:

- **`packages/core`** — Core library: inventory management, config export engine, health checker, security auditor, registry client
- **`packages/cli`** — CLI application built with Commander.js
- **`packages/web`** — Web UI (planned)

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Watch mode (CLI)
cd packages/cli && npm run dev
```

## License

[MIT](LICENSE)
