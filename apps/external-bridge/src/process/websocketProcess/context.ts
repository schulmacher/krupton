import { SF } from '@krupton/service-framework-node';
import { createEndpointStorageRepository } from '../../repository.js';
import type { WebsocketEnv } from './environment.js';
import { websocketEnvSchema } from './environment.js';

export function createWebsocketContext() {
  const envContext = SF.createEnvContext(websocketEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    metrics: {},
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });

  const endpointStorageRepository = createEndpointStorageRepository(
    envContext.config.STORAGE_BASE_DIR,
    envContext.config.PLATFORM,
  );

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    endpointStorageRepository,
  };
}

export type WebsocketContext = ReturnType<typeof createWebsocketContext>;

export type WebsocketMetrics = SF.RegisteredMetrics<WebsocketContext>;

export type WebsocketServiceContext = SF.ServiceContext<WebsocketEnv, WebsocketMetrics>;
