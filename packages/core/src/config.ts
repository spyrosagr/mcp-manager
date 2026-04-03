import * as fs from 'node:fs';
import { z } from 'zod';
import { getMcpmanConfigPath, getMcpmanDataDir } from './utils/paths.js';

const McpmanConfigSchema = z.object({
  version: z.number().default(1),
  registry: z.object({
    apiUrl: z.string().default('https://registry.modelcontextprotocol.io'),
    cacheTtlSeconds: z.number().default(86400),
    maxCacheSize: z.number().default(10000),
  }).default({}),
  health: z.object({
    defaultTimeoutMs: z.number().default(10000),
    defaultConcurrency: z.number().default(5),
    pruneKeepPerServer: z.number().default(100),
    discoverTools: z.boolean().default(true),
    discoverResources: z.boolean().default(true),
    discoverPrompts: z.boolean().default(true),
  }).default({}),
  export: z.object({
    backupEnabled: z.boolean().default(true),
    mergeEnabled: z.boolean().default(true),
    defaultClients: z.array(z.string()).default(['claude-desktop', 'cursor', 'vscode']),
  }).default({}),
  security: z.object({
    encryptionEnabled: z.boolean().default(true),
  }).default({}),
  ui: z.object({
    defaultPort: z.number().default(3847),
    openBrowser: z.boolean().default(true),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
  }).default({}),
});

type McpmanConfigData = z.infer<typeof McpmanConfigSchema>;

export class McpmanConfig {
  private data: McpmanConfigData;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || getMcpmanConfigPath();
    this.data = this.load();
  }

  private load(): McpmanConfigData {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);
      return McpmanConfigSchema.parse(parsed);
    } catch {
      return McpmanConfigSchema.parse({});
    }
  }

  save(): void {
    const dir = getMcpmanDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  get(path: string): unknown {
    const parts = path.split('.');
    let current: unknown = this.data;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  set(path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = this.data as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
    this.save();
  }

  getAll(): McpmanConfigData {
    return structuredClone(this.data);
  }
}
