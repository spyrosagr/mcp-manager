import type Database from 'better-sqlite3';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import type { InventoryManager } from '../inventory/inventory.js';
import type { ClientType } from '../inventory/types.js';
import { ALL_CLIENTS, getClientConfigPath } from '../index.js';
import type { HealthCheckResult } from '../health/types.js';
import type { AuditRule, AuditFinding, AuditRun, AuditOptions, AuditContext } from './types.js';
import { hardcodedSecretsRule, dockerSocketRule } from './rules/hardcoded-secrets.js';
import { unencryptedTransportRule, missingAuthRule } from './rules/transport-security.js';
import { envVarExposureRule } from './rules/env-var-exposure.js';
import { permissionScopeRule } from './rules/permission-scope.js';
import { dependencyCheckRule } from './rules/dependency-check.js';

const DEFAULT_RULES: AuditRule[] = [
  hardcodedSecretsRule,
  dockerSocketRule,
  unencryptedTransportRule,
  missingAuthRule,
  envVarExposureRule,
  permissionScopeRule,
  dependencyCheckRule,
];

interface AuditRunRow {
  id: string;
  scope: string;
  target_id: string | null;
  total_findings: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  started_at: string;
  completed_at: string | null;
}

interface AuditFindingRow {
  id: string;
  run_id: string;
  server_id: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string;
  remediation: string | null;
  evidence: string | null;
  found_at: string;
}

export class SecurityAuditor {
  private rules: AuditRule[];

  constructor(
    private db: Database.Database,
    private inventory: InventoryManager,
    rules?: AuditRule[],
  ) {
    this.rules = rules || DEFAULT_RULES;
  }

  audit(options?: AuditOptions): AuditRun {
    const startedAt = new Date().toISOString();
    const runId = crypto.randomBytes(16).toString('hex');

    // Determine servers to audit
    let servers = this.inventory.list();
    if (options?.serverIds) {
      servers = servers.filter((s) => options.serverIds!.includes(s.id));
    }
    if (options?.profileId) {
      servers = this.inventory.getServersInProfile(options.profileId);
    }

    // Determine rules to run
    let rules = this.rules;
    if (options?.ruleIds) {
      rules = rules.filter((r) => options.ruleIds!.includes(r.id));
    }

    // Build audit context
    const configFiles = new Map<ClientType, string>();
    for (const client of ALL_CLIENTS) {
      try {
        const configPath = getClientConfigPath(client);
        const content = fs.readFileSync(configPath, 'utf-8');
        configFiles.set(client, content);
      } catch {
        // Config file doesn't exist
      }
    }

    const context: AuditContext = {
      allServers: servers,
      configFiles,
    };

    // Run rules
    const findings: AuditFinding[] = [];
    for (const server of servers) {
      for (const rule of rules) {
        const finding = rule.check(server, context);
        if (finding) {
          // Apply severity filter
          if (options?.severity && !options.severity.includes(finding.severity)) {
            continue;
          }
          findings.push(finding);
        }
      }
    }

    // Count by severity
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) {
      counts[f.severity]++;
    }

    const completedAt = new Date().toISOString();

    // Save to database
    const scope = options?.serverIds?.length === 1 ? 'server' : options?.profileId ? 'profile' : 'all';
    const targetId = options?.serverIds?.length === 1
      ? options.serverIds[0]
      : options?.profileId || null;

    this.db.prepare(`
      INSERT INTO audit_runs (id, scope, target_id, total_findings, critical_count, high_count,
        medium_count, low_count, info_count, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId, scope, targetId, findings.length,
      counts.critical, counts.high, counts.medium, counts.low, counts.info,
      startedAt, completedAt,
    );

    const insertFinding = this.db.prepare(`
      INSERT INTO audit_findings (run_id, server_id, rule_id, severity, title, description,
        remediation, evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const f of findings) {
      insertFinding.run(
        runId, f.serverId, f.ruleId, f.severity, f.title, f.description,
        f.remediation || null, f.evidence || null,
      );
    }

    return {
      id: runId,
      scope: scope as AuditRun['scope'],
      targetId: targetId || undefined,
      totalFindings: findings.length,
      criticalCount: counts.critical,
      highCount: counts.high,
      mediumCount: counts.medium,
      lowCount: counts.low,
      infoCount: counts.info,
      startedAt,
      completedAt,
      findings,
    };
  }

  auditServer(serverId: string): AuditFinding[] {
    const run = this.audit({ serverIds: [serverId] });
    return run.findings;
  }

  getLatestRun(): AuditRun | null {
    const row = this.db.prepare(
      'SELECT * FROM audit_runs ORDER BY started_at DESC LIMIT 1',
    ).get() as AuditRunRow | undefined;
    if (!row) return null;
    return this.hydrateRun(row);
  }

  getFindings(runId: string): AuditFinding[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_findings WHERE run_id = ?',
    ).all(runId) as AuditFindingRow[];
    return rows.map(hydrateFinding);
  }

  getServerFindings(serverId: string): AuditFinding[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_findings WHERE server_id = ? ORDER BY found_at DESC',
    ).all(serverId) as AuditFindingRow[];
    return rows.map(hydrateFinding);
  }

  private hydrateRun(row: AuditRunRow): AuditRun {
    const findings = this.getFindings(row.id);
    return {
      id: row.id,
      scope: row.scope as AuditRun['scope'],
      targetId: row.target_id || undefined,
      totalFindings: row.total_findings,
      criticalCount: row.critical_count,
      highCount: row.high_count,
      mediumCount: row.medium_count,
      lowCount: row.low_count,
      infoCount: row.info_count,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      findings,
    };
  }
}

function hydrateFinding(row: AuditFindingRow): AuditFinding {
  return {
    ruleId: row.rule_id,
    serverId: row.server_id,
    severity: row.severity as AuditFinding['severity'],
    title: row.title,
    description: row.description,
    remediation: row.remediation || '',
    evidence: row.evidence || undefined,
  };
}
