import { createEndpointStorageRepository, createWebsocketStorageRepository } from '@krupton/persistent-jsonl-storage-node';
import { SF } from '@krupton/service-framework-node';
import { krakenWebSocketEnvSchema, type KrakenWebSocketEnv } from './environment.js';

export function createKrakenWebsocketContext() {
  const envContext = SF.createEnvContext(krakenWebSocketEnvSchema);

  const diagnosticContext = SF.createDiagnosticContext(envContext, {
    minimumSeverity: (envContext.config.LOG_LEVEL as SF.LogSeverity) || 'info',
  });

  const metricsContext = SF.createMetricsContext({
    envContext,
    enableDefaultMetrics: true,
    prefix: 'external_bridge_websocket',
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
  );

  const endpointStorageRepository = createEndpointStorageRepository(
    envContext.config.STORAGE_BASE_DIR,
  );

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    websocketStorageRepository,
    endpointStorageRepository,
  };
}

export type KrakenWebSocketContext = ReturnType<typeof createKrakenWebsocketContext>;
export type KrakenWebSocketMetrics = SF.RegisteredMetrics<KrakenWebSocketContext>;
export type KrakenWebSocketServiceContext = SF.ServiceContext<
  KrakenWebSocketEnv,
  KrakenWebSocketMetrics
>;
