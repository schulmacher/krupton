import { SF } from '@krupton/service-framework-node';
import type { MdsStorageEnv } from './environment.js';
import { mdsStorageEnvSchema } from './environment.js';

export function createMdsStorageContext(customEnv?: Record<string, string | undefined>) {
  const envContext = SF.createEnvContext(mdsStorageEnvSchema, { source: customEnv });

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {
      directoryStorageSize: SF.mdsStorageMetrics.directoryStorageSize,
      directoryFileCount: SF.mdsStorageMetrics.directoryFileCount,
      directoryLastUpdated: SF.mdsStorageMetrics.directoryLastUpdated,
      backupSuccesses: SF.mdsStorageMetrics.backupSuccesses,
      backupFailures: SF.mdsStorageMetrics.backupFailures,
      backupLastTimestamp: SF.mdsStorageMetrics.backupLastTimestamp,
      backupSize: SF.mdsStorageMetrics.backupSize,
    },
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
  };
}

export type MdsStorageContext = ReturnType<typeof createMdsStorageContext>;

export type MdsStorageMetrics = SF.RegisteredMetrics<MdsStorageContext>;

export type MdsStorageServiceContext = SF.ServiceContext<MdsStorageEnv, MdsStorageMetrics>;
