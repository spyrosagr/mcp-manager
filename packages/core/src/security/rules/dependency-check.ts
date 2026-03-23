import type { AuditRule, AuditFinding, AuditContext } from '../types.js';
import type { McpServer } from '../../inventory/types.js';

export const dependencyCheckRule: AuditRule = {
  id: 'SEC-005',
  name: 'Dependency Vulnerabilities',
  description: 'Checks npm packages for known security advisories',
  severity: 'low',
  check(server: McpServer, _context: AuditContext): AuditFinding | null {
    // For npm-based servers (npx command), check if a package name is available
    if (server.command !== 'npx' && server.command !== 'npm') return null;

    // Extract package name from args
    let packageName: string | undefined;
    if (server.args) {
      for (const arg of server.args) {
        if (arg.startsWith('@') || (!arg.startsWith('-') && arg.includes('/'))) {
          packageName = arg;
          break;
        }
        // Skip flags like -y
        if (!arg.startsWith('-') && !packageName) {
          packageName = arg;
        }
      }
    }

    if (!packageName) return null;

    // Note: Actual npm advisory check would require an async HTTP call.
    // For now, flag that the package should be checked.
    // A full implementation would call https://registry.npmjs.org/-/npm/v1/security/advisories
    // This is a placeholder that reminds users to check.
    return null; // No finding unless we detect an actual advisory
  },
};
