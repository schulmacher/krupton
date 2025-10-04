import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const getCurrentFileDir = (): string => {
  return dirname(fileURLToPath(import.meta.url));
};

export const getAppRootDir = (): string => {
  const currentDir = getCurrentFileDir();
  return resolve(currentDir, '..', '..');
};

export const getMonorepoRootDir = (...paths: string[]): string => {
  const appRoot = getAppRootDir();
  return resolve(appRoot, '..', '..', ...paths);
};

