import { z } from 'zod';

export const TransportType = z.enum(['stdio', 'sse', 'streamable-http']);
export type TransportType = z.infer<typeof TransportType>;

export const ClientType = z.enum([
  'claude-desktop', 'cursor', 'vscode', 'claude-code',
  'cline', 'windsurf', 'continue', 'zed',
]);
export type ClientType = z.infer<typeof ClientType>;

export const ALL_CLIENTS: ClientType[] = ClientType.options;

export const ServerSource = z.enum(['manual', 'imported', 'registry']);
export type ServerSource = z.infer<typeof ServerSource>;

export const ServerClientSchema = z.object({
  client: ClientType,
  enabled: z.boolean(),
});
export type ServerClient = z.infer<typeof ServerClientSchema>;

export const McpServerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).regex(
    /^[a-z0-9][a-z0-9._-]*$/i,
    'Name must start with alphanumeric and contain only alphanumeric, dots, hyphens, underscores',
  ),
  displayName: z.string().optional(),
  description: z.string().optional(),
  transport: TransportType,

  // STDIO fields
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),

  // HTTP/SSE fields
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),

  // Env vars
  envVars: z.record(z.string()).optional(),

  // Metadata
  source: ServerSource,
  sourceClient: ClientType.optional(),
  registryId: z.string().optional(),
  repositoryUrl: z.string().optional(),
  npmPackage: z.string().optional(),
  pypiPackage: z.string().optional(),
  dockerImage: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),

  // State
  enabled: z.boolean(),
  clients: z.array(ServerClientSchema),

  createdAt: z.string(),
  updatedAt: z.string(),
}).refine(
  (data) => {
    if (data.transport === 'stdio') return !!data.command;
    if (data.transport === 'sse' || data.transport === 'streamable-http') return !!data.url;
    return true;
  },
  { message: 'STDIO servers require a command; HTTP/SSE servers require a URL' },
);

export type McpServer = z.infer<typeof McpServerSchema>;

export const CreateServerInput = z.object({
  name: z.string().min(1).max(100).regex(
    /^[a-z0-9][a-z0-9._-]*$/i,
    'Name must start with alphanumeric and contain only alphanumeric, dots, hyphens, underscores',
  ),
  displayName: z.string().optional(),
  description: z.string().optional(),
  transport: TransportType,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  envVars: z.record(z.string()).optional(),
  source: ServerSource,
  sourceClient: ClientType.optional(),
  registryId: z.string().optional(),
  repositoryUrl: z.string().optional(),
  npmPackage: z.string().optional(),
  pypiPackage: z.string().optional(),
  dockerImage: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean(),
  clients: z.array(ServerClientSchema),
}).refine(
  (data) => {
    if (data.transport === 'stdio') return !!data.command;
    if (data.transport === 'sse' || data.transport === 'streamable-http') return !!data.url;
    return true;
  },
  { message: 'STDIO servers require a command; HTTP/SSE servers require a URL' },
);
export type CreateServerInput = z.infer<typeof CreateServerInput>;

export const UpdateServerInput = z.object({
  name: z.string().min(1).max(100).regex(
    /^[a-z0-9][a-z0-9._-]*$/i,
    'Name must start with alphanumeric and contain only alphanumeric, dots, hyphens, underscores',
  ).optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  transport: TransportType.optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  envVars: z.record(z.string()).optional(),
  source: ServerSource.optional(),
  sourceClient: ClientType.optional(),
  registryId: z.string().optional(),
  repositoryUrl: z.string().optional(),
  npmPackage: z.string().optional(),
  pypiPackage: z.string().optional(),
  dockerImage: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  clients: z.array(ServerClientSchema).optional(),
});
export type UpdateServerInput = z.infer<typeof UpdateServerInput>;

export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export interface ListOptions {
  transport?: TransportType;
  client?: ClientType;
  enabled?: boolean;
  profileId?: string;
  search?: string;
  tags?: string[];
  source?: ServerSource;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ name: string; error: string }>;
  servers: McpServer[];
}
