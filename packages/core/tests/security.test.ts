import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { InventoryManager } from '../src/inventory/inventory.js';
import { SecurityAuditor } from '../src/security/auditor.js';
import { runMigrations } from '../src/db/migrate.js';
import type { CreateServerInput } from '../src/inventory/types.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeServer(overrides: Partial<CreateServerInput> = {}): CreateServerInput {
  return {
    name: 'test-server',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@test/server'],
    source: 'manual',
    enabled: true,
    clients: [{ client: 'claude-desktop', enabled: true }],
    ...overrides,
  };
}

describe('SecurityAuditor', () => {
  let db: Database.Database;
  let inventory: InventoryManager;
  let auditor: SecurityAuditor;

  beforeEach(() => {
    db = createTestDb();
    inventory = new InventoryManager(db);
    auditor = new SecurityAuditor(db, inventory);
  });

  afterEach(() => {
    db.close();
  });

  describe('SEC-001: Hardcoded Secrets', () => {
    it('detects AWS access key in env vars', () => {
      inventory.create(makeServer({
        name: 'aws-server',
        envVars: { AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE' },
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-001');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('critical');
      expect(finding!.evidence).toContain('env.AWS_ACCESS_KEY_ID');
    });

    it('detects GitHub token in env vars', () => {
      inventory.create(makeServer({
        name: 'gh-server',
        envVars: { GITHUB_TOKEN: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh12' },
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-001');
      expect(finding).toBeDefined();
    });

    it('detects high-entropy strings', () => {
      // A high-entropy random string
      inventory.create(makeServer({
        name: 'entropy-server',
        envVars: { SECRET: 'aB3$cD5^eF7&gH9*iJ1!kL3@mN5#oP7' },
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-001');
      expect(finding).toBeDefined();
    });

    it('does not flag safe env values', () => {
      inventory.create(makeServer({
        name: 'safe-server',
        envVars: { NODE_ENV: 'production', PORT: '3000' },
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-001');
      expect(finding).toBeUndefined();
    });
  });

  describe('SEC-002: Unencrypted Transport', () => {
    it('flags HTTP URLs for remote servers', () => {
      inventory.create(makeServer({
        name: 'http-server',
        transport: 'sse',
        command: undefined,
        url: 'http://remote.example.com/sse',
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-002');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('high');
    });

    it('does not flag localhost HTTP', () => {
      inventory.create(makeServer({
        name: 'local-server',
        transport: 'sse',
        command: undefined,
        url: 'http://localhost:3000/sse',
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-002');
      expect(finding).toBeUndefined();
    });

    it('does not flag HTTPS URLs', () => {
      inventory.create(makeServer({
        name: 'secure-server',
        transport: 'sse',
        command: undefined,
        url: 'https://remote.example.com/sse',
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-002');
      expect(finding).toBeUndefined();
    });
  });

  describe('SEC-006: Missing Authentication', () => {
    it('flags remote servers without auth headers', () => {
      inventory.create(makeServer({
        name: 'noauth-server',
        transport: 'sse',
        command: undefined,
        url: 'https://remote.example.com/sse',
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-006');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('high');
    });

    it('does not flag servers with Authorization header', () => {
      inventory.create(makeServer({
        name: 'auth-server',
        transport: 'sse',
        command: undefined,
        url: 'https://remote.example.com/sse',
        headers: { Authorization: 'Bearer token123' },
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-006');
      expect(finding).toBeUndefined();
    });
  });

  describe('SEC-007: Docker Socket Exposure', () => {
    it('flags docker socket in args', () => {
      inventory.create(makeServer({
        name: 'docker-server',
        args: ['run', '-v', '/var/run/docker.sock:/var/run/docker.sock', 'my-image'],
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-007');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('critical');
    });

    it('does not flag args without docker socket', () => {
      inventory.create(makeServer({
        name: 'safe-docker',
        args: ['run', '-v', '/data:/data', 'my-image'],
      }));

      const run = auditor.audit();
      const finding = run.findings.find((f) => f.ruleId === 'SEC-007');
      expect(finding).toBeUndefined();
    });
  });

  describe('Audit orchestration', () => {
    it('returns correct counts by severity', () => {
      // Create a server that triggers multiple rules
      inventory.create(makeServer({
        name: 'bad-server',
        transport: 'sse',
        command: undefined,
        url: 'http://remote.example.com/sse',
        envVars: { SECRET: 'AKIAIOSFODNN7EXAMPLE' },
      }));

      const run = auditor.audit();
      expect(run.totalFindings).toBeGreaterThan(0);
      expect(run.criticalCount + run.highCount + run.mediumCount + run.lowCount + run.infoCount)
        .toBe(run.totalFindings);
    });

    it('saves audit run to database', () => {
      inventory.create(makeServer({ name: 'audit-test' }));
      auditor.audit();

      const latest = auditor.getLatestRun();
      expect(latest).toBeDefined();
      expect(latest!.scope).toBe('all');
      expect(latest!.completedAt).toBeDefined();
    });

    it('filters by server IDs', () => {
      const s1 = inventory.create(makeServer({ name: 'server-1' }));
      inventory.create(makeServer({
        name: 'server-2',
        envVars: { KEY: 'AKIAIOSFODNN7EXAMPLE' },
      }));

      const run = auditor.audit({ serverIds: [s1.id] });
      // Should only audit server-1 which has no secrets
      const secretFindings = run.findings.filter((f) => f.ruleId === 'SEC-001');
      expect(secretFindings.length).toBe(0);
    });

    it('clean server produces no findings for transport rules', () => {
      inventory.create(makeServer({
        name: 'clean-stdio',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@safe/server'],
        envVars: { NODE_ENV: 'production' },
      }));

      const run = auditor.audit();
      // stdio servers should not trigger SEC-002 or SEC-006
      const transportFindings = run.findings.filter(
        (f) => f.ruleId === 'SEC-002' || f.ruleId === 'SEC-006',
      );
      expect(transportFindings.length).toBe(0);
    });
  });
});
