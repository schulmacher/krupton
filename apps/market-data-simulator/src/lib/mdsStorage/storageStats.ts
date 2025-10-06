import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DirectoryStats, FileInfo } from './types';

export const STORAGE_DIRECTORY_PATTERNS = ['binance/**', 'kraken/**', 'victoria_metrics'];

const collectFilesRecursively = async (dirPath: string): Promise<FileInfo[]> => {
  const files: FileInfo[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await collectFilesRecursively(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const stats = await stat(fullPath);
        files.push({ path: fullPath, size: stats.size, mtime: stats.mtimeMs });
      }
    }
  } catch (error) {
    // Directory might not exist or be accessible
    console.warn(`Could not read directory ${dirPath}:`, error);
  }

  return files;
};

const matchesPattern = (relativePath: string, pattern: string): string | null => {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    if (relativePath.startsWith(prefix + '/')) {
      // Extract the first two levels for binance/kraken (e.g., 'binance/api_v3_depth')
      const parts = relativePath.split('/');
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }
  } else {
    // Exact match for victoria_metrics
    if (relativePath.startsWith(pattern)) {
      return pattern;
    }
  }
  return null;
};

export const readStorageStats = async (baseDir: string): Promise<DirectoryStats[]> => {
  const allFiles = await collectFilesRecursively(baseDir);

  const directoryMap = new Map<
    string,
    { fileCount: number; sizeBytes: number; lastUpdated: number }
  >();
  const unmatchedFiles: FileInfo[] = [];

  for (const file of allFiles) {
    const relativePath = file.path.substring(baseDir.length + 1);
    let matched = false;

    for (const pattern of STORAGE_DIRECTORY_PATTERNS) {
      const matchedDir = matchesPattern(relativePath, pattern);
      if (matchedDir) {
        const existing = directoryMap.get(matchedDir) || {
          fileCount: 0,
          sizeBytes: 0,
          lastUpdated: 0,
        };
        directoryMap.set(matchedDir, {
          fileCount: existing.fileCount + 1,
          sizeBytes: existing.sizeBytes + file.size,
          lastUpdated: Math.max(existing.lastUpdated, file.mtime),
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      unmatchedFiles.push(file);
    }
  }

  const result: DirectoryStats[] = Array.from(directoryMap.entries()).map(([directory, stats]) => ({
    directory,
    fileCount: stats.fileCount,
    sizeBytes: stats.sizeBytes,
    lastUpdated: stats.lastUpdated,
  }));

  // Sort by directory name for consistent output
  result.sort((a, b) => a.directory.localeCompare(b.directory));

  // Add unmatched files if any exist
  if (unmatchedFiles.length > 0) {
    const unmatchedSizeBytes = unmatchedFiles.reduce((sum, file) => sum + file.size, 0);
    const unmatchedLastUpdated = Math.max(...unmatchedFiles.map((file) => file.mtime));
    result.push({
      directory: '',
      fileCount: unmatchedFiles.length,
      sizeBytes: unmatchedSizeBytes,
      lastUpdated: unmatchedLastUpdated,
    });
  }

  return result;
};
