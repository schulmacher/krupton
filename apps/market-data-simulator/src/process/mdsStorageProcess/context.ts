import { SF } from '@krupton/service-framework-node';
import type { MdsStorageEnv } from './environment.js';
import { mdsStorageEnvSchema } from './environment.js';

export const createMdsStorageContext = () => {
  const envContext = SF.createEnvContext(mdsStorageEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {
      writeOperations: SF.mdsStorageMetrics.writeOperations,
      readOperations: SF.mdsStorageMetrics.readOperations,
      backupOperations: SF.mdsStorageMetrics.backupOperations,
      backupFailures: SF.mdsStorageMetrics.backupFailures,
      storageSize: SF.mdsStorageMetrics.storageSize,
      fileCount: SF.mdsStorageMetrics.fileCount,
      backupLastTimestamp: SF.mdsStorageMetrics.backupLastTimestamp,
      backupSize: SF.mdsStorageMetrics.backupSize,
      writeDuration: SF.mdsStorageMetrics.writeDuration,
      backupDuration: SF.mdsStorageMetrics.backupDuration,
      fileSize: SF.mdsStorageMetrics.fileSize,
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
};

export type MdsStorageContext = ReturnType<typeof createMdsStorageContext>;

export type MdsStorageMetrics = SF.RegisteredMetrics<MdsStorageContext>;

export type MdsStorageServiceContext = SF.ServiceContext<MdsStorageEnv, MdsStorageMetrics>;
