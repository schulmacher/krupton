import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  WriteStorageParams as AppendStorageParams,
  ReadStorageParams,
  StorageRecord,
  WriteStorageParams
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
