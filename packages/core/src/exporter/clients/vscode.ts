import type { McpServer } from '../../inventory/types.js';

export function generateVSCodeConfig(servers: McpServer[]): Record<string, unknown> {
  const serverEntries: Record<string, unknown> = {};

  for (const server of servers) {
    if (server.transport === 'stdio') {
      serverEntries[server.name] = {
        type: 'stdio',
        command: server.command,
        args: server.args ?? [],
        ...(server.envVars && Object.keys(server.envVars).length > 0 && { env: server.envVars }),
      };
    } else {
      serverEntries[server.name] = {
        type: server.transport === 'streamable-http' ? 'streamable-http' : 'sse',
        url: server.url,
        ...(server.headers && Object.keys(server.headers).length > 0 && { headers: server.headers }),
      };
    }
  }

  return {
    mcp: {
      servers: serverEntries,
    },
  };
}
