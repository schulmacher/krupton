import { SF } from '@krupton/service-framework-node';
import { createWebsocketStorageRepository } from '../../entities/websocketStorageRepository.js';
import { binanceWebSocketEnvSchema, type BinanceWebSocketEnv } from './environment.js';
import { createEndpointStorageRepository } from '../../entities/endpointStorageRepository.js';

export function createBinanceWebsocketContext() {
  const envContext = SF.createEnvContext(binanceWebSocketEnvSchema);

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

export type BinanceWebSocketContext = ReturnType<typeof createBinanceWebsocketContext>;
export type BinanceWebSocketMetrics = SF.RegisteredMetrics<BinanceWebSocketContext>;
export type BinanceWebSocketServiceContext = SF.ServiceContext<
  BinanceWebSocketEnv,
  BinanceWebSocketMetrics
>;
