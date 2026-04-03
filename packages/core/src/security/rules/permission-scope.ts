import type { AuditRule, AuditFinding, AuditContext } from '../types.js';
import type { McpServer } from '../../inventory/types.js';

const DANGEROUS_TOOL_PATTERNS = [
  /^exec$/i, /^shell$/i, /^run_command$/i, /^bash$/i, /^execute$/i,
  /^run$/i, /^terminal$/i, /^cmd$/i,
];

const DANGEROUS_WRITE_PATTERNS = [
  /write/i, /delete/i, /remove/i, /create_file/i, /modify/i,
];

const SSRF_PATTERNS = [
  /fetch/i, /request/i, /http/i, /curl/i,
];

export const permissionScopeRule: AuditRule = {
  id: 'SEC-004',
  name: 'Overly Broad Permissions',
  description: 'Flags servers exposing dangerous tools (exec, shell, filesystem write)',
  severity: 'medium',
  check(server: McpServer, context: AuditContext): AuditFinding | null {
    const healthResult = context.healthResults?.get(server.id);
    if (!healthResult?.tools || healthResult.tools.length === 0) return null;

    const dangerousTools: string[] = [];

    for (const tool of healthResult.tools) {
      const name = tool.name;

      // Check for execution tools
      if (DANGEROUS_TOOL_PATTERNS.some((p) => p.test(name))) {
        dangerousTools.push(`${name} (shell execution)`);
        continue;
      }

      // Check for filesystem write tools
      if (DANGEROUS_WRITE_PATTERNS.some((p) => p.test(name))) {
        dangerousTools.push(`${name} (filesystem modification)`);
        continue;
      }

      // Check for SSRF risk
      if (SSRF_PATTERNS.some((p) => p.test(name))) {
        dangerousTools.push(`${name} (potential SSRF)`);
      }
    }

    if (dangerousTools.length === 0) return null;

    return {
      ruleId: 'SEC-004',
      serverId: server.id,
      severity: 'medium',
      title: `Overly broad permissions in "${server.name}" server`,
      description: `Server exposes ${dangerousTools.length} potentially dangerous tool(s).`,
      remediation: 'Review this server\'s tools carefully. Consider sandboxing with Docker or restricting the server\'s filesystem access.',
      evidence: dangerousTools.join(', '),
    };
  },
};
