export type Platform = 'macos' | 'linux' | 'windows';

export function getPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}

export function getHomeDir(): string {
  return process.env['HOME'] || process.env['USERPROFILE'] || '~';
}
