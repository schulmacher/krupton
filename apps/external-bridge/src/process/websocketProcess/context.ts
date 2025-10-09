import { SF } from '@krupton/service-framework-node';
import { createWebsocketStorageRepository } from '../../entities/websocketStorageRepository.js';
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
    metrics: {
      messagesReceived: SF.externalBridgeWebsocketsMetrics.messagesReceived,
      messageProcessingDuration: SF.externalBridgeWebsocketsMetrics.messageProcessingDuration,
      connectionStatus: SF.externalBridgeWebsocketsMetrics.connectionStatus,
      reconnectionAttempts: SF.externalBridgeWebsocketsMetrics.reconnectionAttempts,
      activeSubscriptions: SF.externalBridgeWebsocketsMetrics.activeSubscriptions,
      validationErrors: SF.externalBridgeWebsocketsMetrics.validationErrors,
      connectionUptime: SF.externalBridgeWebsocketsMetrics.connectionUptime,
      lastMessageTimestamp: SF.externalBridgeWebsocketsMetrics.lastMessageTimestamp,
    },
  });

  const processContext = SF.createProcessLifecycle({
    diagnosticContext,
  });

  const websocketStorageRepository = createWebsocketStorageRepository(
    envContext.config.STORAGE_BASE_DIR,
    envContext.config.PLATFORM,
  );

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    websocketStorageRepository,
  };
}

export type WebsocketContext = ReturnType<typeof createWebsocketContext>;

export type WebsocketMetrics = SF.RegisteredMetrics<WebsocketContext>;

export type WebsocketServiceContext = SF.ServiceContext<WebsocketEnv, WebsocketMetrics>;
