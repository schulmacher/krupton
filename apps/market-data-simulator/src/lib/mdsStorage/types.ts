export type Platform = 'binance' | 'kraken';

export type StorageRecord<T = unknown> = {
  timestamp: number;
  endpoint: string;
  params: Record<string, unknown>;
  response: T;
};

export type WriteStorageParams<T = unknown> = {
  platform: Platform;
  endpoint: string;
  symbol: string;
  record: StorageRecord<T>;
  idx?: string;
};
export type AppendStorageParams<T = unknown> = WriteStorageParams<T>;

export type ReadStorageParams = {
  platform: Platform;
  endpoint: string;
  symbol: string;
  startTimestamp?: number;
  endTimestamp?: number;
  limit?: number;
};

export type ReadLatestRecordParams = {
  platform: Platform;
  endpoint: string;
  symbol: string;
};

export type BackupMetadata = {
  lastBackupTimestamp: number;
  snapshots: SnapshotInfo[];
};

export type SnapshotInfo = {
  filename: string;
  timestamp: number;
  sizeBytes: number;
};

export type StorageStats = {
  totalSizeBytes: number;
  fileCount: number;
  platformStats: Record<Platform, { sizeBytes: number; fileCount: number }>;
};
