import type { HealthCheckResult } from './types.js';
import type { McpServer } from '../inventory/types.js';

export async function probeHttp(
  server: McpServer,
  timeoutMs: number,
  _options: { discoverTools?: boolean; discoverResources?: boolean; discoverPrompts?: boolean },
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const result: HealthCheckResult = {
    serverId: server.id,
    serverName: server.name,
    status: 'unknown',
    responseTimeMs: 0,
    checkedAt: new Date().toISOString(),
  };

  if (!server.url) {
    result.status = 'unhealthy';
    result.error = 'No URL specified';
    return result;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(server.headers || {}),
    };

    // For SSE endpoints, just check if we can connect
    const response = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'mcpman-health-checker', version: '1.0.0' },
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    result.responseTimeMs = Date.now() - startTime;

    if (response.ok) {
      try {
        const body = await response.json();
        const rpcResult = (body as Record<string, unknown>)['result'] as Record<string, unknown> | undefined;
        if (rpcResult) {
          result.protocolVersion = rpcResult['protocolVersion'] as string;
          const serverInfo = rpcResult['serverInfo'] as Record<string, string> | undefined;
          if (serverInfo) {
            result.serverInfo = { name: serverInfo['name'] || '', version: serverInfo['version'] || '' };
          }
          result.capabilities = rpcResult['capabilities'] as Record<string, unknown>;
        }
        result.status = 'healthy';
      } catch {
        // Response wasn't JSON — might be SSE endpoint
        result.status = 'healthy';
      }
    } else {
      result.status = 'unhealthy';
      result.error = `HTTP ${response.status}: ${response.statusText}`;
    }
  } catch (err) {
    result.responseTimeMs = Date.now() - startTime;
    if (err instanceof Error && err.name === 'AbortError') {
      result.status = 'timeout';
      result.error = `Timeout after ${timeoutMs}ms`;
    } else {
      result.status = 'unhealthy';
      result.error = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}
