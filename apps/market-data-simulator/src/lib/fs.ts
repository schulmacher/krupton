import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

function getCurrentFileDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function getAppRootDir(): string {
  const currentDir = getCurrentFileDir();
  return resolve(currentDir, '..', '..');
}

export function getMonorepoRootDir(...paths: string[]): string {
  const appRoot = getAppRootDir();
  return resolve(appRoot, '..', '..', ...paths);
}
export async function ensureDirectoryExistsForFile(filePath: string) {
  try {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
}
