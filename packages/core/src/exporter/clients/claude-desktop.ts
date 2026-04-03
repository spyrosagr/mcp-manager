import type { McpServer } from '../../inventory/types.js';

export function generateClaudeDesktopConfig(servers: McpServer[]): Record<string, unknown> {
  return generateMcpServersConfig(servers);
}

/**
 * Shared generator for clients that use the standard { mcpServers: { ... } } format.
 * Used by: Claude Desktop, Cursor, Claude Code, Cline, Windsurf, Continue
 */
export function generateMcpServersConfig(servers: McpServer[]): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};

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
