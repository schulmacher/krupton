import { BinanceApi } from '@krupton/api-interface';
import { createZmqProducerRegistry, zmqSocketTempalates } from '@krupton/messaging-node';
import {
  createBinanceDiffDepthWSStorage,
  createBinanceExchangeInfoStorage,
  createBinanceOrderBookStorage,
  createBinanceTradeWSStorage,
} from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import { createBinanceAuthHeaders } from '../../../../../packages/api-client-node/dist/apiAuth.js';
import { createApiClient } from '../../../../../packages/api-client-node/dist/apiClient.js';
import { binanceWebSocketEnvSchema, type BinanceWebSocketEnv } from './environment.js';

export function createBinanceWebsocketContext(processContext: SF.ProcessLifecycleContext) {
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

  const storage = {
    trade: createBinanceTradeWSStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
    diffDepth: createBinanceDiffDepthWSStorage(envContext.config.STORAGE_BASE_DIR, {
      writable: true,
    }),
    exchangeInfo: createBinanceExchangeInfoStorage(envContext.config.STORAGE_BASE_DIR, {
      writable: false,
    }),
    orderBook: createBinanceOrderBookStorage(envContext.config.STORAGE_BASE_DIR, {
      writable: true,
    }),
  };

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

  const producers = {
    binanceTrade: createZmqProducerRegistry({
      socketTemplate: zmqSocketTempalates.binanceTradeWs,
    }),
    binanceDiffDepth: createZmqProducerRegistry({
      socketTemplate: zmqSocketTempalates.binanceDiffDepth,
    }),
  };

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    binanceClient,
    producers,
    storage,
  };
}

export type BinanceWebSocketContext = ReturnType<typeof createBinanceWebsocketContext>;
export type BinanceWebSocketMetrics = SF.RegisteredMetrics<BinanceWebSocketContext>;
export type BinanceWebSocketServiceContext = SF.ServiceContext<
  BinanceWebSocketEnv,
  BinanceWebSocketMetrics
>;
