import type { WriteStorageParams, ReadStorageParams, StorageRecord } from './types.js';

const normalizeEndpointPath = (endpoint: string): string => {
  return endpoint.replace(/^\/+/, '').replace(/\//g, '_');
};

const getStorageFilePath = (
  baseDir: string,
  platform: string,
  endpoint: string,
  symbol: string,
): string => {
  const normalizedEndpoint = normalizeEndpointPath(endpoint);
  const date = new Date().toISOString().split('T')[0];
  return `${baseDir}/${platform}/${normalizedEndpoint}/${symbol}/${date}.jsonl`;
};

export const createStorageIO = (baseDir: string) => {
  return {
    async writeRecord(params: WriteStorageParams): Promise<void> {
      const { platform, endpoint, symbol, record } = params;
      const filePath = getStorageFilePath(baseDir, platform, endpoint, symbol);

      console.log('[MOCK] Writing storage record:', {
        filePath,
        platform,
        endpoint,
        symbol,
        timestamp: record.timestamp,
      });
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

