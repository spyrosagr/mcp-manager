import type { AuditRule, AuditFinding, AuditContext } from '../types.js';
import type { McpServer } from '../../inventory/types.js';

export const unencryptedTransportRule: AuditRule = {
  id: 'SEC-002',
  name: 'Unencrypted Transport',
  description: 'Flags HTTP (non-HTTPS) URLs for remote servers',
  severity: 'high',
  check(server: McpServer, _context: AuditContext): AuditFinding | null {
    if (server.transport !== 'sse' && server.transport !== 'streamable-http') return null;
    if (!server.url) return null;

    try {
      const url = new URL(server.url);
      if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return {
          ruleId: 'SEC-002',
          serverId: server.id,
          severity: 'high',
          title: `Unencrypted transport for "${server.name}" server`,
          description: `Server URL uses HTTP instead of HTTPS: ${server.url}`,
          remediation: 'Switch to HTTPS. If the server doesn\'t support TLS, consider running it behind a reverse proxy with TLS termination.',
          evidence: server.url,
        };
      }
    } catch {
      // Invalid URL
    }

    return null;
  },
};

export const missingAuthRule: AuditRule = {
  id: 'SEC-006',
  name: 'Missing Authentication',
  description: 'Flags remote servers with no auth headers configured',
  severity: 'high',
  check(server: McpServer, _context: AuditContext): AuditFinding | null {
    if (server.transport !== 'sse' && server.transport !== 'streamable-http') return null;
    if (!server.url) return null;

    try {
      const url = new URL(server.url);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return null;
    } catch {
      return null;
    }

    // Check if any auth header is present
    if (server.headers) {
      const headerKeys = Object.keys(server.headers).map((k) => k.toLowerCase());
      const authHeaders = ['authorization', 'x-api-key', 'x-auth-token', 'api-key'];
      if (authHeaders.some((h) => headerKeys.includes(h))) {
        return null;
      }
    }

    return {
      ruleId: 'SEC-006',
      serverId: server.id,
      severity: 'high',
      title: `No authentication for "${server.name}" server`,
      description: `Remote server at ${server.url} has no authentication headers configured.`,
      remediation: 'Remote MCP servers should require authentication. Add an Authorization header or API key to prevent unauthorized access.',
    };
  },
};
