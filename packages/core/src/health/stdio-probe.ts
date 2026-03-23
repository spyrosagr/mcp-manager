import { spawn } from 'node:child_process';
import type { HealthCheckResult, ToolDescriptor, ResourceDescriptor, PromptDescriptor } from './types.js';
import type { McpServer } from '../inventory/types.js';
import { logger } from '../utils/logger.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export async function probeStdio(
  server: McpServer,
  timeoutMs: number,
  options: { discoverTools?: boolean; discoverResources?: boolean; discoverPrompts?: boolean },
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const result: HealthCheckResult = {
    serverId: server.id,
    serverName: server.name,
    status: 'unknown',
    responseTimeMs: 0,
    checkedAt: new Date().toISOString(),
  };

  if (!server.command) {
    result.status = 'unhealthy';
    result.error = 'No command specified';
    return result;
  }

  return new Promise<HealthCheckResult>((resolve) => {
    const env = { ...process.env, ...(server.envVars || {}) };
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(server.command!, server.args || [], {
        env,
        cwd: server.cwd || undefined,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      result.status = 'unhealthy';
      result.error = `Failed to spawn: ${err instanceof Error ? err.message : String(err)}`;
      result.responseTimeMs = Date.now() - startTime;
      resolve(result);
      return;
    }

    const timeout = setTimeout(() => {
      result.status = 'timeout';
      result.error = `Timeout after ${timeoutMs}ms`;
      result.responseTimeMs = Date.now() - startTime;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000);
      resolve(result);
    }, timeoutMs);

    let buffer = '';
    let requestId = 1;
    const pendingRequests = new Map<number, (response: JsonRpcResponse) => void>();

    child.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      // Process newline-delimited JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse;
          if (msg.id !== undefined) {
            const handler = pendingRequests.get(msg.id);
            if (handler) {
              pendingRequests.delete(msg.id);
              handler(msg);
            }
          }
        } catch {
          logger.debug('Non-JSON output from server', { line: trimmed });
        }
      }
    });

    let stderrOutput = '';
    child.stderr?.on('data', (data: Buffer) => {
      stderrOutput += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      result.status = 'unhealthy';
      result.error = `Process error: ${err.message}`;
      result.responseTimeMs = Date.now() - startTime;
      resolve(result);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (result.status === 'unknown') {
        result.status = 'unhealthy';
        result.error = `Process exited with code ${code}. stderr: ${stderrOutput.slice(0, 500)}`;
        result.responseTimeMs = Date.now() - startTime;
        resolve(result);
      }
    });

    function sendRequest(method: string, params?: unknown): Promise<JsonRpcResponse> {
      return new Promise((res) => {
        const id = requestId++;
        const request: JsonRpcRequest = {
          jsonrpc: '2.0',
          id,
          method,
          params,
        };
        pendingRequests.set(id, res);
        child.stdin?.write(JSON.stringify(request) + '\n');
      });
    }

    function sendNotification(method: string, params?: unknown): void {
      const request: JsonRpcRequest = { jsonrpc: '2.0', method, params };
      child.stdin?.write(JSON.stringify(request) + '\n');
    }

    // Run the MCP handshake
    (async () => {
      try {
        // 1. Initialize
        const initResponse = await sendRequest('initialize', {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'mcpman-health-checker', version: '1.0.0' },
        });

        if (initResponse.error) {
          result.status = 'unhealthy';
          result.error = `Initialize error: ${initResponse.error.message}`;
          result.responseTimeMs = Date.now() - startTime;
          clearTimeout(timeout);
          child.kill('SIGTERM');
          resolve(result);
          return;
        }

        const initResult = initResponse.result as Record<string, unknown> | undefined;
        if (initResult) {
          result.protocolVersion = initResult['protocolVersion'] as string;
          const serverInfo = initResult['serverInfo'] as Record<string, string> | undefined;
          if (serverInfo) {
            result.serverInfo = { name: serverInfo['name'] || '', version: serverInfo['version'] || '' };
          }
          result.capabilities = initResult['capabilities'] as Record<string, unknown>;
        }

        // 2. Send initialized notification
        sendNotification('notifications/initialized');

        // 3. Discover tools
        if (options.discoverTools !== false) {
          try {
            const toolsResponse = await sendRequest('tools/list');
            if (toolsResponse.result) {
              const toolsResult = toolsResponse.result as { tools?: ToolDescriptor[] };
              result.tools = toolsResult.tools || [];
            }
          } catch {
            // Server may not support tools/list
          }
        }

        // 4. Discover resources
        if (options.discoverResources !== false) {
          try {
            const resourcesResponse = await sendRequest('resources/list');
            if (resourcesResponse.result) {
              const resResult = resourcesResponse.result as { resources?: ResourceDescriptor[] };
              result.resources = resResult.resources || [];
            }
          } catch {
            // Server may not support resources/list
          }
        }

        // 5. Discover prompts
        if (options.discoverPrompts !== false) {
          try {
            const promptsResponse = await sendRequest('prompts/list');
            if (promptsResponse.result) {
              const prResult = promptsResponse.result as { prompts?: PromptDescriptor[] };
              result.prompts = prResult.prompts || [];
            }
          } catch {
            // Server may not support prompts/list
          }
        }

        result.status = 'healthy';
        result.responseTimeMs = Date.now() - startTime;

        clearTimeout(timeout);
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
        resolve(result);
      } catch (err) {
        clearTimeout(timeout);
        result.status = 'unhealthy';
        result.error = `Probe error: ${err instanceof Error ? err.message : String(err)}`;
        result.responseTimeMs = Date.now() - startTime;
        child.kill('SIGTERM');
        resolve(result);
      }
    })();
  });
}
