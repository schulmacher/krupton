import { mkdir, writeFile, appendFile, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  WriteStorageParams as AppendStorageParams,
  ReadStorageParams,
  StorageRecord,
  ReadLatestRecordParams,
  WriteStorageParams,
} from './types.js';

const normalizeEndpointPath = (endpoint: string): string => {
  return endpoint.replace(/^\/+/, '').replace(/\//g, '_');
};

const getStorageFilePath = (
  baseDir: string,
  platform: string,
  endpoint: string,
  symbol: string,
  idx?: string,
): string => {
  const normalizedEndpoint = normalizeEndpointPath(endpoint);
  const fileIdentifier = idx ?? new Date().toISOString().slice(0, 10);
  return `${baseDir}/${platform}/${normalizedEndpoint}/${symbol}/${fileIdentifier}.jsonl`;
};

const ensureDirectoryExists = async (filePath: string): Promise<void> => {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
};

export const createStorageIO = (baseDir: string) => {
  return {
    async writeRecord(params: WriteStorageParams): Promise<void> {
      const { platform, endpoint, symbol, record, idx } = params;
      const filePath = getStorageFilePath(baseDir, platform, endpoint, symbol, idx);

      await ensureDirectoryExists(filePath);

      const jsonLine = JSON.stringify(record) + '\n';
      await writeFile(filePath, jsonLine, 'utf-8');
    },

    async appendRecord(params: AppendStorageParams): Promise<void> {
      const { platform, endpoint, symbol, record, idx } = params;
      const filePath = getStorageFilePath(baseDir, platform, endpoint, symbol, idx);

      await ensureDirectoryExists(filePath);

      const jsonLine = JSON.stringify(record) + '\n';
      await appendFile(filePath, jsonLine, 'utf-8');
    },

    async readRecords(params: ReadStorageParams): Promise<StorageRecord[]> {
      const { platform, endpoint, symbol, startTimestamp, endTimestamp, limit } = params;

      console.log('[MOCK] Reading storage records:', {
        platform,
        endpoint,
        symbol,
        startTimestamp,
        endTimestamp,
        limit,
      });

      return [];
    },

    async readLatestRecord<T = unknown>(
      params: ReadLatestRecordParams,
    ): Promise<StorageRecord<T> | null> {
      const { platform, endpoint, symbol } = params;
      const normalizedEndpoint = normalizeEndpointPath(endpoint);
      const directoryPath = join(baseDir, platform, normalizedEndpoint, symbol);

      try {
        const files = await readdir(directoryPath);

        if (files.length === 0) {
          return null;
        }

        const jsonlFiles = files.filter((file) => file.endsWith('.jsonl'));

        if (jsonlFiles.length === 0) {
          return null;
        }

        // TODO FIX ME ACCEPT SORTFN BASED ON INDEX TYPE
        const sortedFiles = jsonlFiles.sort((a, b) => {
          const aNum = parseInt(a.replace('.jsonl', ''), 10);
          const bNum = parseInt(b.replace('.jsonl', ''), 10);
          return aNum - bNum;
        });

        const latestFile = sortedFiles[sortedFiles.length - 1]!;
        const filePath = join(directoryPath, latestFile);

        const fileContent = await readFile(filePath, 'utf-8');
        const lines = fileContent
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        if (lines.length === 0) {
          return null;
        }

        const lastLine = lines[lines.length - 1]!;
        return JSON.parse(lastLine) as StorageRecord<T>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async appendOrOverwriteIfIdenticalResponse(params: AppendStorageParams): Promise<{ wasOverwritten: boolean }> {
      const { platform, endpoint, symbol, record, idx } = params;
      const filePath = getStorageFilePath(baseDir, platform, endpoint, symbol, idx);

      await ensureDirectoryExists(filePath);

      try {
        const fileContent = await readFile(filePath, 'utf-8');
        const lines = fileContent.split('\n').filter((line) => line.length > 0);

        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1]!;
          const lastRecord = JSON.parse(lastLine) as StorageRecord;

          if (JSON.stringify(lastRecord.response) === JSON.stringify(record.response)) {
            lines[lines.length - 1] = JSON.stringify(record);
            await writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
            return { wasOverwritten: true };
          }
        }

        const jsonLine = JSON.stringify(record) + '\n';
        await appendFile(filePath, jsonLine, 'utf-8');
        return { wasOverwritten: false };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          const jsonLine = JSON.stringify(record) + '\n';
          await writeFile(filePath, jsonLine, 'utf-8');
          return { wasOverwritten: false };
        }
        throw error;
      }
    },

    // TODO the ordering is flawed, move to repositories and entities where each endpoints "entity" implements this method
    async getLatestFileInfo(params: ReadLatestRecordParams): Promise<{ idx: string; recordCount: number } | null> {
      const { platform, endpoint, symbol } = params;
      const normalizedEndpoint = normalizeEndpointPath(endpoint);
      const directoryPath = join(baseDir, platform, normalizedEndpoint, symbol);

      try {
        const files = await readdir(directoryPath);

        if (files.length === 0) {
          return null;
        }

        const jsonlFiles = files.filter((file) => file.endsWith('.jsonl'));

        if (jsonlFiles.length === 0) {
          return null;
        }

        const sortedFiles = jsonlFiles.sort((a, b) => {
          const getComparableValue = (filename: string): string => {
            return filename.replace('.jsonl', '');
          };
          return getComparableValue(a).localeCompare(getComparableValue(b));
        });

        const latestFile = sortedFiles[sortedFiles.length - 1]!;
        const idx = latestFile.replace('.jsonl', '');
        const filePath = join(directoryPath, latestFile);

        const fileContent = await readFile(filePath, 'utf-8');
        const lines = fileContent
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        return {
          idx,
          recordCount: lines.length,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async getStorageStats() {
      console.log('[MOCK] Getting storage stats');

      return {
        totalSizeBytes: 1024 * 1024 * 100,
        fileCount: 42,
        platformStats: {
          binance: { sizeBytes: 1024 * 1024 * 60, fileCount: 25 },
          kraken: { sizeBytes: 1024 * 1024 * 40, fileCount: 17 },
        },
      };
    },
  };
};

export type StorageIO = ReturnType<typeof createStorageIO>;
