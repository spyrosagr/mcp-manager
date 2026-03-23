import type { McpServer } from '../../inventory/types.js';

export function generateZedConfig(servers: McpServer[]): Record<string, unknown> {
  const contextServers: Record<string, unknown> = {};

  for (const server of servers) {
    if (server.transport === 'stdio') {
      contextServers[server.name] = {
        command: server.command,
        args: server.args ?? [],
        ...(server.envVars && Object.keys(server.envVars).length > 0 && { env: server.envVars }),
      };
    }
    // Zed SSE support — include if url-based
    if (server.transport === 'sse' || server.transport === 'streamable-http') {
      contextServers[server.name] = {
        url: server.url,
        ...(server.headers && Object.keys(server.headers).length > 0 && { headers: server.headers }),
      };
    }
  }

  return { context_servers: contextServers };
}
