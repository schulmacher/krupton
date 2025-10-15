import { SF } from '@krupton/service-framework-node';
import type { StorageEnv } from './environment.js';
import { storageEnvSchema } from './environment.js';

export function createStorageContext(
  processContext: SF.ProcessLifecycleContext,
  customEnv?: Record<string, string | undefined>,
) {
  const envContext = SF.createEnvContext(storageEnvSchema, { source: customEnv });

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {
      directoryStorageSize: SF.storageMetrics.directoryStorageSize,
      directoryFileCount: SF.storageMetrics.directoryFileCount,
      directoryLastUpdated: SF.storageMetrics.directoryLastUpdated,
      backupSuccesses: SF.storageMetrics.backupSuccesses,
      backupFailures: SF.storageMetrics.backupFailures,
      backupLastTimestamp: SF.storageMetrics.backupLastTimestamp,
      backupSize: SF.storageMetrics.backupSize,
    },
  });
  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
  };
}

export type StorageContext = ReturnType<typeof createStorageContext>;

export type StorageMetrics = SF.RegisteredMetrics<StorageContext>;

export type StorageServiceContext = SF.ServiceContext<StorageEnv, StorageMetrics>;
