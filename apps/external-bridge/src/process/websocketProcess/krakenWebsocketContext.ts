import { createZmqPublisherRegistry, zmqSocketTempalatesRawData } from '@krupton/messaging-node';
import {
  createKrakenAssetInfoStorage,
  createKrakenAssetPairsStorage,
  createKrakenBookWSStorage,
  createKrakenTickerWSStorage,
  createKrakenTradeWSStorage,
  KrakenBookWSRecord,
  KrakenTradeWSRecord,
} from '@krupton/persistent-storage-node';
import { SF } from '@krupton/service-framework-node';
import { krakenWebSocketEnvSchema, type KrakenWebSocketEnv } from './environment.js';

export function createKrakenWebsocketContext(processContext: SF.ProcessLifecycleContext) {
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

  const storage = {
    ticker: createKrakenTickerWSStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
    trade: createKrakenTradeWSStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
    book: createKrakenBookWSStorage(envContext.config.STORAGE_BASE_DIR, { writable: true }),
    assetPairs: createKrakenAssetPairsStorage(envContext.config.STORAGE_BASE_DIR, {
      writable: false,
    }),
    assetInfo: createKrakenAssetInfoStorage(envContext.config.STORAGE_BASE_DIR, {
      writable: false,
    }),
  };

  const producers = {
    krakenTradeWs: createZmqPublisherRegistry<KrakenTradeWSRecord>({
      socketTemplate: zmqSocketTempalatesRawData.krakenTradeWs,
      diagnosticContext,
    }),
    krakenBookWs: createZmqPublisherRegistry<KrakenBookWSRecord>({
      socketTemplate: zmqSocketTempalatesRawData.krakenOrderBookWs,
      diagnosticContext,
    }),
  };

  return {
    envContext,
    diagnosticContext,
    metricsContext,
    processContext,
    storage,
    producers,
  };
}

export type KrakenWebSocketContext = ReturnType<typeof createKrakenWebsocketContext>;
export type KrakenWebSocketMetrics = SF.RegisteredMetrics<KrakenWebSocketContext>;
export type KrakenWebSocketServiceContext = SF.ServiceContext<
  KrakenWebSocketEnv,
  KrakenWebSocketMetrics
>;
