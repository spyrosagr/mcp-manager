import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMcpmanDbPath } from '../utils/paths.js';
import { runMigrations } from './migrate.js';

export function getDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || getMcpmanDbPath();

  // Create directory if needed (unless in-memory)
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const db = new Database(resolvedPath);

  // Configure SQLite for performance and safety
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run migrations
  runMigrations(db);

  return db;
}
