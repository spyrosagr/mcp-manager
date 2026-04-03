import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMcpmanDataDir } from './paths.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getOrCreateEncryptionKey(): Buffer {
  // Check environment variable first
  const envKey = process.env['MCPMAN_ENCRYPTION_KEY'];
  if (envKey) {
    return crypto.scryptSync(envKey, 'mcpman-salt', KEY_LENGTH);
  }

  // Fall back to file-based key
  const keyPath = path.join(getMcpmanDataDir(), 'key');
  try {
    const keyData = fs.readFileSync(keyPath);
    return keyData.subarray(0, KEY_LENGTH);
  } catch {
    // Generate a new key
    const dataDir = getMcpmanDataDir();
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const key = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    return key;
  }
}

export function encrypt(plaintext: string): string {
  const key = getOrCreateEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext
  return `encrypted:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedValue: string): string {
  if (!encryptedValue.startsWith('encrypted:')) {
    return encryptedValue; // Not encrypted, return as-is
  }

  const parts = encryptedValue.slice('encrypted:'.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const [ivHex, tagHex, ciphertext] = parts as [string, string, string];
  const key = getOrCreateEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith('encrypted:');
}
