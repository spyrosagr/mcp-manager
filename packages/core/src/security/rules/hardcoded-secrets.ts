import type { AuditRule, AuditFinding, AuditContext } from '../types.js';
import type { McpServer } from '../../inventory/types.js';

const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,                                  // AWS Access Key
  /gh[pousr]_[A-Za-z0-9_]{36,}/,                       // GitHub Token
  /xox[bpors]-[0-9a-zA-Z-]+/,                         // Slack Token
  /^sk-[a-zA-Z0-9]{20,}/,                             // Generic sk- prefix
  /^pk-[a-zA-Z0-9]{20,}/,                             // Generic pk- prefix
  /^Bearer\s+[A-Za-z0-9._~+/=-]{20,}/,               // Bearer token
  /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/,       // DB URL with password
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,           // Private key
  /^eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+/,           // JWT
];

const ENTROPY_THRESHOLD = 4.5;
const MIN_LENGTH_FOR_ENTROPY = 20;

function shannonEntropy(str: string): number {
  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function redactValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

function checkValueForSecrets(value: string): boolean {
  // Check against known patterns
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) return true;
  }

  // Check Shannon entropy for high-entropy random strings
  if (value.length >= MIN_LENGTH_FOR_ENTROPY && shannonEntropy(value) > ENTROPY_THRESHOLD) {
    return true;
  }

  return false;
}

export const hardcodedSecretsRule: AuditRule = {
  id: 'SEC-001',
  name: 'Hardcoded Secrets',
  description: 'Detects API keys, tokens, and high-entropy strings in config values',
  severity: 'critical',
  check(server: McpServer, _context: AuditContext): AuditFinding | null {
    const findings: Array<{ field: string; value: string }> = [];

    // Check env vars
    if (server.envVars) {
      for (const [key, value] of Object.entries(server.envVars)) {
        if (value && checkValueForSecrets(value)) {
          findings.push({ field: `env.${key}`, value });
        }
      }
    }

    // Check args for secrets
    if (server.args) {
      for (const arg of server.args) {
        if (checkValueForSecrets(arg)) {
          findings.push({ field: 'args', value: arg });
        }
      }
    }

    // Check headers
    if (server.headers) {
      for (const [key, value] of Object.entries(server.headers)) {
        if (value && checkValueForSecrets(value)) {
          findings.push({ field: `headers.${key}`, value });
        }
      }
    }

    if (findings.length === 0) return null;

    const evidence = findings
      .map((f) => `${f.field} = "${redactValue(f.value)}"`)
      .join('; ');

    return {
      ruleId: 'SEC-001',
      serverId: server.id,
      severity: 'critical',
      title: `Hardcoded secret in "${server.name}" server`,
      description: `Found ${findings.length} potential secret(s) hardcoded in the server configuration.`,
      remediation: 'Move secret values to environment variables referenced by name. Use a .env file or your OS keychain for the actual secret value.',
      evidence,
    };
  },
};

export const dockerSocketRule: AuditRule = {
  id: 'SEC-007',
  name: 'Docker Socket Exposure',
  description: 'Flags servers mounting /var/run/docker.sock',
  severity: 'critical',
  check(server: McpServer, _context: AuditContext): AuditFinding | null {
    const argsStr = (server.args || []).join(' ');
    if (argsStr.includes('/var/run/docker.sock')) {
      return {
        ruleId: 'SEC-007',
        serverId: server.id,
        severity: 'critical',
        title: `Docker socket exposure in "${server.name}" server`,
        description: 'This server mounts the Docker socket, granting full host access.',
        remediation: 'Avoid mounting the Docker socket. Use Docker-in-Docker or rootless Docker instead.',
        evidence: '/var/run/docker.sock found in args',
      };
    }
    return null;
  },
};
