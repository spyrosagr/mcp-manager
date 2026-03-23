import type { McpServer, ClientType } from '../inventory/types.js';
import type { HealthCheckResult } from '../health/types.js';

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AuditRule {
  id: string;
  name: string;
  description: string;
  severity: AuditSeverity;
  check(server: McpServer, context: AuditContext): AuditFinding | null;
}

export interface AuditContext {
  allServers: McpServer[];
  healthResults?: Map<string, HealthCheckResult>;
  configFiles: Map<ClientType, string>;
}

export interface AuditFinding {
  ruleId: string;
  serverId: string;
  severity: AuditSeverity;
  title: string;
  description: string;
  remediation: string;
  evidence?: string;
}

export interface AuditRun {
  id: string;
  scope: 'all' | 'server' | 'profile';
  targetId?: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  startedAt: string;
  completedAt?: string;
  findings: AuditFinding[];
}

export interface AuditOptions {
  profileId?: string;
  serverIds?: string[];
  ruleIds?: string[];
  severity?: AuditSeverity[];
}
