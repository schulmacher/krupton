import {
  createEndpointStorageRepository,
  createWebsocketStorageRepository,
} from '@krupton/persistent-jsonl-storage-node';
import { SF } from '@krupton/service-framework-node';
import { binanceWebSocketEnvSchema, type BinanceWebSocketEnv } from './environment.js';
import { createBinanceAuthHeaders } from '../../../../../packages/api-client-node/dist/apiAuth.js';
import { createApiClient } from '../../../../../packages/api-client-node/dist/apiClient.js';
import { BinanceApi } from '@krupton/api-interface';

export function createBinanceWebsocketContext() {
  const envContext = SF.createEnvContext(binanceWebSocketEnvSchema);
  envContext.config.LOG_LEVEL = 'debug';

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

  const binanceClient = createApiClient(
    {
      baseUrl: envContext.config.API_BASE_URL,
      headers: envContext.config.API_KEY
        ? createBinanceAuthHeaders(envContext.config.API_KEY)
        : undefined,
      validation: true,
    },
    {
      getOrderBook: BinanceApi.GetOrderBookEndpoint,
    },
  );

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    websocketStorageRepository,
    endpointStorageRepository,
    binanceClient,
  };
}

export type BinanceWebSocketContext = ReturnType<typeof createBinanceWebsocketContext>;
export type BinanceWebSocketMetrics = SF.RegisteredMetrics<BinanceWebSocketContext>;
export type BinanceWebSocketServiceContext = SF.ServiceContext<
  BinanceWebSocketEnv,
  BinanceWebSocketMetrics
>;
