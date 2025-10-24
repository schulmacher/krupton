import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { KrakenWS } from '@krupton/api-interface';
import { KrakenBookWSRecord, KrakenTradeWSRecord } from '@krupton/persistent-storage-node';
import { arrayToMultiMap } from '@krupton/utils';
import { initKrakenLatestAssetPairsProvider } from '../../lib/symbol/krakenLatestAssetsProvider.js';
import { normalizeSymbol, unnormalizeToKrakenWSSymbol } from '../../lib/symbol/normalizeSymbol.js';
import { KrakenWebsocketManager } from '../../lib/websockets/KrakenWebsocketManager.js';
import type { KrakenWebSocketContext } from './krakenWebsocketContext.js';

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

  await initKrakenLatestAssetPairsProvider(context.storage.assetPairs, context.storage.assetInfo);

  const symbols = config.SYMBOLS.split(',')
    .map((s) => s.trim())
    .map((s) => unnormalizeToKrakenWSSymbol(s).trim());

  const normalizedSymbols = symbols.map((s) => normalizeSymbol('kraken', s));

  const KrakenWSDefinition = {
    tickerStream: KrakenWS.TickerStream,
    tradeStream: KrakenWS.TradeStream,
    bookStream: KrakenWS.BookStream,
  };
  const websocketManager = new KrakenWebsocketManager(
    context,
    createWSHandlers(KrakenWSDefinition, {
      tickerStream: async (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          await context.storage.ticker.appendRecord({
            subIndex: normalizedSymbol,
            record: {
              timestamp: Date.now(),
              message: {
                channel: 'ticker',
                type: message.type,
                data: messages,
              },
            },
          });
        }
      },
      tradeStream: async (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          const record: Omit<KrakenTradeWSRecord, 'id'> = {
            timestamp: Date.now(),
            message: {
              channel: 'trade',
              type: message.type,
              data: messages,
            },
          };
          const id = await context.storage.trade.appendRecord({
            subIndex: normalizedSymbol,
            record,
          });
          (record as KrakenTradeWSRecord).id = id;
          await context.producers.krakenTradeWs.send(normalizedSymbol, record as KrakenTradeWSRecord);
        }
      },
      bookStream: async (message) => {
        const messagesBySymbol = arrayToMultiMap(message.data, (item) => item.symbol);
        for (const [symbol, messages] of messagesBySymbol.entries()) {
          const normalizedSymbol = normalizeSymbol('kraken', symbol);
          const record: Omit<KrakenBookWSRecord, 'id'> = {
            timestamp: Date.now(),
            message: {
              channel: 'book',
              type: message.type,
              data: messages,
            },
          };
          const id = await context.storage.book.appendRecord({
            subIndex: normalizedSymbol,
            record,
          });
          (record as KrakenBookWSRecord).id = id;
          await context.producers.krakenBookWs.send(normalizedSymbol, record as KrakenBookWSRecord);
        }
      },
    }),
    [
      { channel: 'ticker', symbols, snapshot: true },
      { channel: 'trade', symbols, snapshot: true },
      { channel: 'book', symbols, depth: 10, snapshot: true },
    ],
  );

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.disconnect();
      for (const producer of Object.values(context.producers)) {
        await producer.close();
      }
    });
  };

  registerGracefulShutdownCallback();

  diagnosticContext.logger.info('Starting websocket manager', { symbols });
  await websocketManager.connect();

  for (const producer of Object.values(context.producers)) {
    await producer.connect(normalizedSymbols);
  }

  await httpServer.startServer();
}
