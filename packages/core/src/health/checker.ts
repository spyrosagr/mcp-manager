import type Database from 'better-sqlite3';
import type { HealthCheckOptions, HealthCheckResult } from './types.js';
import type { McpServer } from '../inventory/types.js';
import type { InventoryManager } from '../inventory/inventory.js';
import { probeStdio } from './stdio-probe.js';
import { probeHttp } from './http-probe.js';

interface HealthCheckRow {
  id: string;
  server_id: string;
  status: string;
  response_time_ms: number | null;
  protocol_version: string | null;
  server_name: string | null;
  server_version: string | null;
  tools_discovered: string | null;
  resources_discovered: string | null;
  prompts_discovered: string | null;
  capabilities: string | null;
  error_message: string | null;
  checked_at: string;
}

export class HealthChecker {
  private timeoutMs: number;
  private concurrency: number;
  private discoverTools: boolean;
  private discoverResources: boolean;
  private discoverPrompts: boolean;

  constructor(
    private db: Database.Database,
    private inventory: InventoryManager,
    options?: HealthCheckOptions,
  ) {
    this.timeoutMs = options?.timeoutMs ?? 10000;
    this.concurrency = options?.concurrency ?? 5;
    this.discoverTools = options?.discoverTools ?? true;
    this.discoverResources = options?.discoverResources ?? true;
    this.discoverPrompts = options?.discoverPrompts ?? true;
  }

  async check(server: McpServer): Promise<HealthCheckResult> {
    const options = {
      discoverTools: this.discoverTools,
      discoverResources: this.discoverResources,
      discoverPrompts: this.discoverPrompts,
    };

    let result: HealthCheckResult;
    if (server.transport === 'stdio') {
      result = await probeStdio(server, this.timeoutMs, options);
    } else {
      result = await probeHttp(server, this.timeoutMs, options);
    }

    this.saveResult(result);
    return result;
  }

  async checkAll(options?: { profileId?: string; concurrency?: number }): Promise<HealthCheckResult[]> {
    const listOpts: import('../inventory/types.js').ListOptions = { enabled: true };
    if (options?.profileId !== undefined) {
      listOpts.profileId = options.profileId;
    }
    const servers = this.inventory.list(listOpts);

    const concurrency = options?.concurrency ?? this.concurrency;
    const results: HealthCheckResult[] = [];

    // Process in batches for concurrency control
    for (let i = 0; i < servers.length; i += concurrency) {
      const batch = servers.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((server) => this.check(server)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  getLatestStatus(serverId: string): HealthCheckResult | null {
    const row = this.db.prepare(
      'SELECT * FROM health_checks WHERE server_id = ? ORDER BY checked_at DESC LIMIT 1',
    ).get(serverId) as HealthCheckRow | undefined;

    if (!row) return null;
    return this.hydrateResult(row);
  }

  getHistory(serverId: string, limit = 100): HealthCheckResult[] {
    const rows = this.db.prepare(
      'SELECT * FROM health_checks WHERE server_id = ? ORDER BY checked_at DESC LIMIT ?',
    ).all(serverId, limit) as HealthCheckRow[];

    return rows.map((row) => this.hydrateResult(row));
  }

  prune(keepPerServer = 100): number {
    const result = this.db.prepare(`
      DELETE FROM health_checks WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY checked_at DESC) as rn
          FROM health_checks
        ) WHERE rn <= ?
      )
    `).run(keepPerServer);

    return result.changes;
  }

  private saveResult(result: HealthCheckResult): void {
    this.db.prepare(`
      INSERT INTO health_checks (server_id, status, response_time_ms, protocol_version,
        server_name, server_version, tools_discovered, resources_discovered,
        prompts_discovered, capabilities, error_message, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.serverId,
      result.status,
      result.responseTimeMs,
      result.protocolVersion ?? null,
      result.serverInfo?.name ?? null,
      result.serverInfo?.version ?? null,
      result.tools ? JSON.stringify(result.tools) : null,
      result.resources ? JSON.stringify(result.resources) : null,
      result.prompts ? JSON.stringify(result.prompts) : null,
      result.capabilities ? JSON.stringify(result.capabilities) : null,
      result.error ?? null,
      result.checkedAt,
    );
  }

  private hydrateResult(row: HealthCheckRow): HealthCheckResult {
    return {
      serverId: row.server_id,
      serverName: row.server_name || '',
      status: row.status as HealthCheckResult['status'],
      responseTimeMs: row.response_time_ms ?? 0,
      protocolVersion: row.protocol_version ?? undefined,
      serverInfo: row.server_name
        ? { name: row.server_name, version: row.server_version || '' }
        : undefined,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined,
      tools: row.tools_discovered ? JSON.parse(row.tools_discovered) : undefined,
      resources: row.resources_discovered ? JSON.parse(row.resources_discovered) : undefined,
      prompts: row.prompts_discovered ? JSON.parse(row.prompts_discovered) : undefined,
      error: row.error_message ?? undefined,
      checkedAt: row.checked_at,
    };
  }
}
