import type { ClientType } from '../inventory/types.js';

export interface ExportOptions {
  profileId?: string;
  onlyEnabled?: boolean;
  dryRun?: boolean;
  backup?: boolean;
  merge?: boolean;
}

export interface ExportResult {
  client: ClientType;
  configJson: string;
  filePath: string;
  serverCount: number;
  hash: string;
}

export interface ExportPreview {
  client: ClientType;
  currentContent: string | null;
  generatedContent: string;
  diff: string;
  hasChanges: boolean;
}

export interface WriteResult {
  client: ClientType;
  filePath: string;
  backupPath: string | null;
  written: boolean;
  error?: string;
}
