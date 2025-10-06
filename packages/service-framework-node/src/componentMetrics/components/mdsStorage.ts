import type { MetricConfigCounter, MetricConfigGauge } from '../../metrics/types.js';

const writeOperations: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  type: 'counter',
  name: 'storage_write_operations_total',
  help: 'Total number of storage write operations',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

const readOperations: MetricConfigCounter<'platform' | 'endpoint' | 'status'> = {
  type: 'counter',
  name: 'storage_read_operations_total',
  help: 'Total number of storage read operations',
  labelNames: ['platform', 'endpoint', 'status'] as const,
};

const backupSuccesses: MetricConfigCounter = {
  type: 'counter',
  name: 'storage_backup_successes_total',
  help: 'Total number of successful backup operations',
};

const backupFailures: MetricConfigCounter = {
  type: 'counter',
  name: 'storage_backup_failures_total',
  help: 'Total number of failed backup operations',
};

const directoryStorageSize: MetricConfigGauge<'directory'> = {
  type: 'gauge',
  name: 'storage_size_bytes',
  help: 'Total storage consumption in bytes',
  labelNames: ['directory'] as const,
};

const directoryFileCount: MetricConfigGauge<'directory'> = {
  type: 'gauge',
  name: 'storage_file_count',
  help: 'Number of storage files',
  labelNames: ['directory'] as const,
};

const directoryLastUpdated: MetricConfigGauge<'directory'> = {
  type: 'gauge',
  name: 'storage_directory_last_updated_seconds',
  help: 'Unix timestamp of the last update of a directory',
  labelNames: ['directory'] as const,
};

const backupLastTimestamp: MetricConfigGauge = {
  type: 'gauge',
  name: 'storage_backup_last_timestamp_seconds',
  help: 'Unix timestamp of the most recent successful backup',
};

const backupSize: MetricConfigGauge = {
  type: 'gauge',
  name: 'storage_backup_size_bytes',
  help: 'Total size of backup ZIP archives in remote storage',
};

export const mdsStorageMetrics = {
  writeOperations,
  readOperations,
  directoryStorageSize,
  directoryFileCount,
  directoryLastUpdated,
  backupSuccesses,
  backupFailures,
  backupLastTimestamp,
  backupSize,
};
