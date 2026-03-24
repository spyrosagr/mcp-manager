export interface RegistryServer {
  name: string;
  description: string;
  version: string;
  repository: {
    url: string;
    source: string;
  };
  packages?: Array<{
    registry: string;
    name: string;
    version?: string;
  }>;
  remotes?: Array<{
    transportType: string;
    url: string;
  }>;
  meta?: {
    status: string;
    publishedAt: string;
    updatedAt: string;
  };
}

export interface RegistrySearchOptions {
  limit?: number;
  cursor?: string;
}

export interface RegistryListOptions {
  limit?: number;
  cursor?: string;
}

export interface RegistrySearchResult {
  servers: RegistryServer[];
  nextCursor?: string;
  totalCount?: number;
}

export interface CacheRefreshResult {
  totalCached: number;
  newSinceLastRefresh: number;
  refreshedAt: string;
}
