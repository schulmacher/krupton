import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { KrakenWS } from '@krupton/api-interface';
import {
  unnormalizeToKrakenWSSymbol
} from '../../lib/symbol/normalizeSymbol.js';
import { KrakenWebsocketManager } from '../../lib/websockets/KrakenWebsocketManager.js';
import type { KrakenWebSocketContext } from './krakenWebsocketContext.js';
import { initKrakenLatestAssetPairsProvider } from '../../lib/symbol/krakenLatestAssetsProvider.js';

export async function startWebsocketService(context: KrakenWebSocketContext): Promise<void> {
  const { diagnosticContext, processContext, envContext } = context;
  const config = envContext.config;

  const createHttpServerWithHealthChecks = () =>
    SF.createHttpServer(context, {
      healthChecks: [
        async () => ({
          component: 'fetcher',
          isHealthy: true,
        }),
      ],
    });

  const httpServer = createHttpServerWithHealthChecks();

  await initKrakenLatestAssetPairsProvider(
    context.krakenAssetPairs,
    context.krakenAssetInfo,
  );

  const symbols = config.SYMBOLS.split(','  )
    .map((s) => s.trim())
    .map((s) => unnormalizeToKrakenWSSymbol(s).trim());

  const KrakenWSDefinition = {
    tickerStream: KrakenWS.TickerStream,
    tradeStream: KrakenWS.TradeStream,
    bookStream: KrakenWS.BookStream,
  };
  const websocketManager = new KrakenWebsocketManager(
    context,
    createWSHandlers(KrakenWSDefinition, {
      tickerStream: (message) => {
        context.krakenTicker.write({
          message,
        });
      },
      tradeStream: (message) => {
        context.krakenTrade.write({
          message,
        });
      },
      bookStream: (message) => {
        context.krakenBook.write({
          message,
        });
      },
    }),
    [
      { channel: 'ticker', symbols, snapshot: true },
      { channel: 'trade', symbols, snapshot: true },
      { channel: 'book', symbols, depth: 10, snapshot: true },
    ],
  );

  diagnosticContext.logger.info('Starting websocket manager', { symbols });
  await websocketManager.connect();

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.disconnect();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
}
