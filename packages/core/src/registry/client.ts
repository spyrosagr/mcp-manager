import { RegistryError } from '../utils/errors.js';
import { getRegistryCacheDbPath } from '../utils/paths.js';
import { RegistryCache } from './cache.js';
import type {
  RegistryServer,
  RegistrySearchOptions,
  RegistryListOptions,
  RegistrySearchResult,
  CacheRefreshResult,
} from './types.js';

export class RegistryClient {
  private baseUrl: string;
  private cache: RegistryCache;
  private cacheMaxAgeMs: number;

  constructor(options?: {
    baseUrl?: string;
    cacheDbPath?: string;
    cacheMaxAgeMs?: number;
  }) {
    this.baseUrl = options?.baseUrl ?? 'https://registry.modelcontextprotocol.io';
    this.cache = new RegistryCache(options?.cacheDbPath ?? getRegistryCacheDbPath());
    this.cacheMaxAgeMs = options?.cacheMaxAgeMs ?? 24 * 60 * 60 * 1000;
  }

  async search(query: string, options?: RegistrySearchOptions): Promise<RegistrySearchResult> {
    // Refresh cache if stale
    if (this.cache.isStale(this.cacheMaxAgeMs)) {
      try {
        await this.refreshCache();
      } catch {
        // If refresh fails, use existing cache
      }
    }

    const limit = options?.limit ?? 20;
    const servers = this.cache.search(query, limit);

    return {
      servers,
      totalCount: servers.length,
    };
  }

  async getServer(name: string): Promise<RegistryServer | null> {
    // Try cache first
    let server = this.cache.getServer(name);
    if (server) return server;

    // Fetch from API
    try {
      const response = await fetch(`${this.baseUrl}/servers/${encodeURIComponent(name)}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new RegistryError(`Registry API error: ${response.status} ${response.statusText}`);
      }
      server = (await response.json()) as RegistryServer;
      this.cache.upsertServer(server);
      return server;
    } catch (err) {
      if (err instanceof RegistryError) throw err;
      throw new RegistryError(`Failed to fetch server from registry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async list(options?: RegistryListOptions): Promise<RegistrySearchResult> {
    if (this.cache.isStale(this.cacheMaxAgeMs)) {
      try {
        await this.refreshCache();
      } catch {
        // Use existing cache
      }
    }

    const limit = options?.limit ?? 20;
    const servers = this.cache.list(limit);

    return {
      servers,
      totalCount: this.cache.count(),
    };
  }

  async refreshCache(): Promise<CacheRefreshResult> {
    const previousCount = this.cache.count();
    let allServers: RegistryServer[] = [];

    try {
      // The registry API may support different endpoints. We'll try the /servers endpoint.
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const url = new URL(`${this.baseUrl}/servers`);
        url.searchParams.set('limit', '100');
        if (cursor) {
          url.searchParams.set('cursor', cursor);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new RegistryError(`Registry API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as {
          servers?: RegistryServer[];
          items?: RegistryServer[];
          nextCursor?: string;
          next_cursor?: string;
        };

        const servers = data.servers || data.items || [];
        if (servers.length === 0) {
          hasMore = false;
        } else {
          allServers = allServers.concat(servers);
          cursor = data.nextCursor || data.next_cursor;
          hasMore = !!cursor;
        }
      }

      this.cache.upsertMany(allServers);
      const now = new Date().toISOString();
      this.cache.setLastRefreshed(now);

      return {
        totalCached: this.cache.count(),
        newSinceLastRefresh: Math.max(0, this.cache.count() - previousCount),
        refreshedAt: now,
      };
    } catch (err) {
      if (err instanceof RegistryError) throw err;
      throw new RegistryError(`Failed to refresh registry cache: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  close(): void {
    this.cache.close();
  }
}
