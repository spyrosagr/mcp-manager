import type { McpServer } from '../../inventory/types.js';
import { generateMcpServersConfig } from './claude-desktop.js';

export function generateClineConfig(servers: McpServer[]): Record<string, unknown> {
  return generateMcpServersConfig(servers);
}
