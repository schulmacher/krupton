import type {
  MetricConfigCounter,
  MetricConfigGauge,
  MetricConfigHistogram,
} from '../../metrics/types.js';

const writeOperations: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  name: 'storage_write_operations_total',
  help: 'Total number of storage write operations',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

const readOperations: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  name: 'storage_read_operations_total',
  help: 'Total number of storage read operations',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

const backupOperations: MetricConfigCounter = {
  name: 'storage_backup_operations_total',
  help: 'Total number of successful backup operations',
};

const backupFailures: MetricConfigCounter = {
  name: 'storage_backup_failures_total',
  help: 'Total number of failed backup operations',
};

const storageSize: MetricConfigGauge = {
  name: 'storage_size_bytes',
  help: 'Total storage consumption in bytes',
};

const fileCount: MetricConfigGauge<'platform'> = {
  name: 'storage_file_count',
  help: 'Number of storage files',
  labelNames: ['platform'] as const,
};

const backupLastTimestamp: MetricConfigGauge = {
  name: 'storage_backup_last_timestamp_seconds',
  help: 'Unix timestamp of the most recent successful backup',
};

const backupSize: MetricConfigGauge = {
  name: 'storage_backup_size_bytes',
  help: 'Total size of backup ZIP archives in remote storage',
};

const writeDuration: MetricConfigHistogram<'platform' | 'endpoint'> = {
  name: 'storage_write_duration_seconds',
  help: 'Duration of storage write operations',
  labelNames: ['platform', 'endpoint'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
};

const backupDuration: MetricConfigHistogram = {
  name: 'storage_backup_duration_seconds',
  help: 'Duration of backup operations',
  buckets: [1, 5, 10, 30, 60, 120, 300],
};

const fileSize: MetricConfigHistogram<'platform'> = {
  name: 'storage_file_size_bytes',
  help: 'Distribution of storage file sizes',
  labelNames: ['platform'] as const,
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600],
};

export const mdsStorageMetrics = {
  writeOperations,
  readOperations,
  backupOperations,
  backupFailures,
  storageSize,
  fileCount,
  backupLastTimestamp,
  backupSize,
  writeDuration,
  backupDuration,
  fileSize,
};

