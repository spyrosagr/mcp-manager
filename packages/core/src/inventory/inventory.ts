import type Database from 'better-sqlite3';
import * as crypto from 'node:crypto';
import {
  type McpServer,
  type CreateServerInput,
  type UpdateServerInput,
  type Profile,
  type ListOptions,
  type ClientType,
  type ServerClient,
} from './types.js';
import { ServerNotFoundError, DuplicateServerError } from '../utils/errors.js';

interface ServerRow {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  transport: string;
  command: string | null;
  args: string | null;
  cwd: string | null;
  url: string | null;
  headers: string | null;
  env_vars: string | null;
  source: string | null;
  source_client: string | null;
  registry_id: string | null;
  repository_url: string | null;
  npm_package: string | null;
  pypi_package: string | null;
  docker_image: string | null;
  version: string | null;
  tags: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface ClientRow {
  server_id: string;
  client: string;
  enabled: number;
}

interface ProfileRow {
  id: string;
  name: string;
  description: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export class InventoryManager {
  constructor(private db: Database.Database) {}

  create(input: CreateServerInput): McpServer {
    // Check for duplicate name
    const existing = this.db.prepare('SELECT id FROM servers WHERE name = ?').get(input.name);
    if (existing) {
      throw new DuplicateServerError(input.name);
    }

    const id = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO servers (id, name, display_name, description, transport, command, args, cwd, url, headers, env_vars, source, source_client, registry_id, repository_url, npm_package, pypi_package, docker_image, version, tags, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.name,
        input.displayName ?? null,
        input.description ?? null,
        input.transport,
        input.command ?? null,
        input.args ? JSON.stringify(input.args) : null,
        input.cwd ?? null,
        input.url ?? null,
        input.headers ? JSON.stringify(input.headers) : null,
        input.envVars ? JSON.stringify(input.envVars) : null,
        input.source,
        input.sourceClient ?? null,
        input.registryId ?? null,
        input.repositoryUrl ?? null,
        input.npmPackage ?? null,
        input.pypiPackage ?? null,
        input.dockerImage ?? null,
        input.version ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.enabled ? 1 : 0,
        now,
        now,
      );

      // Insert client associations
      const insertClient = this.db.prepare(
        'INSERT INTO server_clients (server_id, client, enabled) VALUES (?, ?, ?)',
      );
      for (const c of input.clients) {
        insertClient.run(id, c.client, c.enabled ? 1 : 0);
      }
    })();

    return this.getById(id)!;
  }

  getById(id: string): McpServer | null {
    const row = this.db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as ServerRow | undefined;
    if (!row) return null;
    return this.hydrateServer(row);
  }

  getByName(name: string): McpServer | null {
    const row = this.db.prepare('SELECT * FROM servers WHERE name = ?').get(name) as ServerRow | undefined;
    if (!row) return null;
    return this.hydrateServer(row);
  }

  list(options?: ListOptions): McpServer[] {
    let sql = 'SELECT DISTINCT s.* FROM servers s';
    const params: unknown[] = [];
    const joins: string[] = [];
    const conditions: string[] = [];

    if (options?.client) {
      joins.push('JOIN server_clients sc ON s.id = sc.server_id');
      conditions.push('sc.client = ? AND sc.enabled = 1');
      params.push(options.client);
    }

    if (options?.profileId) {
      joins.push('JOIN profile_servers ps ON s.id = ps.server_id');
      conditions.push('ps.profile_id = ?');
      params.push(options.profileId);
    }

    if (options?.transport) {
      conditions.push('s.transport = ?');
      params.push(options.transport);
    }

    if (options?.enabled !== undefined) {
      conditions.push('s.enabled = ?');
      params.push(options.enabled ? 1 : 0);
    }

    if (options?.source) {
      conditions.push('s.source = ?');
      params.push(options.source);
    }

    if (options?.search) {
      conditions.push('(s.name LIKE ? OR s.display_name LIKE ? OR s.description LIKE ?)');
      const like = `%${options.search}%`;
      params.push(like, like, like);
    }

    if (options?.tags && options.tags.length > 0) {
      // Match any of the provided tags
      const tagConditions = options.tags.map(() => 's.tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      for (const tag of options.tags) {
        params.push(`%"${tag}"%`);
      }
    }

    sql += ' ' + joins.join(' ');
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const sortBy = options?.sortBy || 'name';
    const sortOrder = options?.sortOrder || 'asc';
    const columnMap: Record<string, string> = {
      name: 's.name',
      createdAt: 's.created_at',
      updatedAt: 's.updated_at',
    };
    sql += ` ORDER BY ${columnMap[sortBy] ?? 's.name'} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as ServerRow[];
    return rows.map((row) => this.hydrateServer(row));
  }

  update(id: string, input: UpdateServerInput): McpServer {
    const existing = this.getById(id);
    if (!existing) {
      throw new ServerNotFoundError(id);
    }

    // Check for name conflict
    if (input.name && input.name !== existing.name) {
      const conflict = this.db.prepare('SELECT id FROM servers WHERE name = ? AND id != ?').get(input.name, id);
      if (conflict) {
        throw new DuplicateServerError(input.name);
      }
    }

    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    const fieldMap: Record<string, string> = {
      name: 'name',
      displayName: 'display_name',
      description: 'description',
      transport: 'transport',
      command: 'command',
      cwd: 'cwd',
      url: 'url',
      source: 'source',
      sourceClient: 'source_client',
      registryId: 'registry_id',
      repositoryUrl: 'repository_url',
      npmPackage: 'npm_package',
      pypiPackage: 'pypi_package',
      dockerImage: 'docker_image',
      version: 'version',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in input && (input as Record<string, unknown>)[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push((input as Record<string, unknown>)[key]);
      }
    }

    // JSON fields
    if (input.args !== undefined) {
      sets.push('args = ?');
      params.push(input.args ? JSON.stringify(input.args) : null);
    }
    if (input.headers !== undefined) {
      sets.push('headers = ?');
      params.push(input.headers ? JSON.stringify(input.headers) : null);
    }
    if (input.envVars !== undefined) {
      sets.push('env_vars = ?');
      params.push(input.envVars ? JSON.stringify(input.envVars) : null);
    }
    if (input.tags !== undefined) {
      sets.push('tags = ?');
      params.push(input.tags ? JSON.stringify(input.tags) : null);
    }
    if (input.enabled !== undefined) {
      sets.push('enabled = ?');
      params.push(input.enabled ? 1 : 0);
    }

    params.push(id);

    this.db.transaction(() => {
      this.db.prepare(`UPDATE servers SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      // Update clients if provided
      if (input.clients) {
        this.db.prepare('DELETE FROM server_clients WHERE server_id = ?').run(id);
        const insertClient = this.db.prepare(
          'INSERT INTO server_clients (server_id, client, enabled) VALUES (?, ?, ?)',
        );
        for (const c of input.clients) {
          insertClient.run(id, c.client, c.enabled ? 1 : 0);
        }
      }
    })();

    return this.getById(id)!;
  }

  delete(id: string): void {
    const existing = this.db.prepare('SELECT id FROM servers WHERE id = ?').get(id);
    if (!existing) {
      throw new ServerNotFoundError(id);
    }
    this.db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  }

  // Bulk operations
  enableAll(client: ClientType): void {
    this.db.prepare('UPDATE server_clients SET enabled = 1 WHERE client = ?').run(client);
  }

  disableAll(client: ClientType): void {
    this.db.prepare('UPDATE server_clients SET enabled = 0 WHERE client = ?').run(client);
  }

  setClientEnabled(serverId: string, client: ClientType, enabled: boolean): void {
    this.db.prepare(
      'UPDATE server_clients SET enabled = ? WHERE server_id = ? AND client = ?',
    ).run(enabled ? 1 : 0, serverId, client);
  }

  // Profile operations
  createProfile(name: string, description?: string): Profile {
    const id = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO profiles (id, name, description, is_default, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    ).run(id, name, description ?? null, now, now);
    return this.getProfileById(id)!;
  }

  listProfiles(): Profile[] {
    const rows = this.db.prepare('SELECT * FROM profiles ORDER BY name ASC').all() as ProfileRow[];
    return rows.map(hydrateProfile);
  }

  getProfileById(id: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
    if (!row) return null;
    return hydrateProfile(row);
  }

  getProfileByName(name: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE name = ?').get(name) as ProfileRow | undefined;
    if (!row) return null;
    return hydrateProfile(row);
  }

  deleteProfile(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  }

  addToProfile(profileId: string, serverId: string): void {
    this.db.prepare(
      'INSERT OR IGNORE INTO profile_servers (profile_id, server_id) VALUES (?, ?)',
    ).run(profileId, serverId);
  }

  removeFromProfile(profileId: string, serverId: string): void {
    this.db.prepare(
      'DELETE FROM profile_servers WHERE profile_id = ? AND server_id = ?',
    ).run(profileId, serverId);
  }

  getServersInProfile(profileId: string): McpServer[] {
    return this.list({ profileId });
  }

  setDefaultProfile(profileId: string): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE profiles SET is_default = 0').run();
      this.db.prepare('UPDATE profiles SET is_default = 1 WHERE id = ?').run(profileId);
    })();
  }

  // Export helpers
  getServersForClient(client: ClientType, profileId?: string): McpServer[] {
    const opts: ListOptions = { client, enabled: true };
    if (profileId !== undefined) {
      opts.profileId = profileId;
    }
    return this.list(opts);
  }

  private hydrateServer(row: ServerRow): McpServer {
    const clientRows = this.db.prepare(
      'SELECT * FROM server_clients WHERE server_id = ?',
    ).all(row.id) as ClientRow[];

    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name ?? undefined,
      description: row.description ?? undefined,
      transport: row.transport as McpServer['transport'],
      command: row.command ?? undefined,
      args: row.args ? JSON.parse(row.args) : undefined,
      cwd: row.cwd ?? undefined,
      url: row.url ?? undefined,
      headers: row.headers ? JSON.parse(row.headers) : undefined,
      envVars: row.env_vars ? JSON.parse(row.env_vars) : undefined,
      source: (row.source ?? 'manual') as McpServer['source'],
      sourceClient: (row.source_client as McpServer['sourceClient']) ?? undefined,
      registryId: row.registry_id ?? undefined,
      repositoryUrl: row.repository_url ?? undefined,
      npmPackage: row.npm_package ?? undefined,
      pypiPackage: row.pypi_package ?? undefined,
      dockerImage: row.docker_image ?? undefined,
      version: row.version ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      enabled: row.enabled === 1,
      clients: clientRows.map((c): ServerClient => ({
        client: c.client as ClientType,
        enabled: c.enabled === 1,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function hydrateProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
