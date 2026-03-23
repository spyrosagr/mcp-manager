export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown' | 'timeout';

export interface HealthCheckOptions {
  timeoutMs?: number;
  concurrency?: number;
  discoverTools?: boolean;
  discoverResources?: boolean;
  discoverPrompts?: boolean;
}

export interface HealthCheckResult {
  serverId: string;
  serverName: string;
  status: HealthStatus;
  responseTimeMs: number;
  protocolVersion?: string;
  serverInfo?: {
    name: string;
    version: string;
  };
  capabilities?: Record<string, unknown>;
  tools?: ToolDescriptor[];
  resources?: ResourceDescriptor[];
  prompts?: PromptDescriptor[];
  error?: string;
  checkedAt: string;
}

export interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface PromptDescriptor {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}
