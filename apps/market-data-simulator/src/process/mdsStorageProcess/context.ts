import { SF } from '@krupton/service-framework-node';
import type { MdsStorageEnv } from './environment.js';
import { mdsStorageEnvSchema } from './environment.js';

export const createMdsStorageContext = () => {
  const envContext = SF.createEnvContext(mdsStorageEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext);

  const metricsContextBase = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
  });

  const metrics = {
    writeOperations: metricsContextBase.createCounter(SF.mdsStorageMetrics.writeOperations),
    readOperations: metricsContextBase.createCounter(SF.mdsStorageMetrics.readOperations),
    backupOperations: metricsContextBase.createCounter(SF.mdsStorageMetrics.backupOperations),
    backupFailures: metricsContextBase.createCounter(SF.mdsStorageMetrics.backupFailures),
    storageSize: metricsContextBase.createGauge(SF.mdsStorageMetrics.storageSize),
    fileCount: metricsContextBase.createGauge(SF.mdsStorageMetrics.fileCount),
    backupLastTimestamp: metricsContextBase.createGauge(SF.mdsStorageMetrics.backupLastTimestamp),
    backupSize: metricsContextBase.createGauge(SF.mdsStorageMetrics.backupSize),
    writeDuration: metricsContextBase.createHistogram(SF.mdsStorageMetrics.writeDuration),
    backupDuration: metricsContextBase.createHistogram(SF.mdsStorageMetrics.backupDuration),
    fileSize: metricsContextBase.createHistogram(SF.mdsStorageMetrics.fileSize),
  };

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics,
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

