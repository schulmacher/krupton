import { SF } from '@krupton/service-framework-node';
import type { CoordinatorEnv } from './environment.js';
import { coordinatorEnvSchema } from './environment.js';

export function createCoordinatorContext(processContext: SF.ProcessLifecycleContext, customEnv?: Record<string, string | undefined>) {
  const envContext = SF.createEnvContext(coordinatorEnvSchema, { source: customEnv });

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {},
  });

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
  };
}

export type CoordinatorContext = ReturnType<typeof createCoordinatorContext>;

export type CoordinatorMetrics = SF.RegisteredMetrics<CoordinatorContext>;

export type CoordinatorServiceContext = SF.ServiceContext<CoordinatorEnv, CoordinatorMetrics>;