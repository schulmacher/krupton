import { SF } from '@krupton/service-framework-node';
import type { MdsRestEnv } from './environment.js';
import { mdsRestEnvSchema } from './environment.js';

export function createMdsRestContext() {
  const envContext = SF.createEnvContext(mdsRestEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
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

export type MdsRestContext = ReturnType<typeof createMdsRestContext>;

export type MdsRestServiceContext = SF.ServiceContext<MdsRestEnv>;
