import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { BinanceWS } from '@krupton/api-interface';
import { SYMBOL_ALL } from '@krupton/persistent-storage-node';
import { saveBinanceOrderBookSnapshots } from '../../fetchers/binanceOrderBook.js';
import { setBinanceLatestExchangeInfo } from '../../lib/symbol/binanceLatestExchangeInfoProvider.js';
import { normalizeSymbol, unnormalizeToBinanceSymbol } from '../../lib/symbol/normalizeSymbol.js';
import { BinanceWebsocketManager } from '../../lib/websockets/BinanceWebsocketManager.js';
import type { BinanceWebSocketContext } from './binanceWebsocketContext.js';

export async function startWebsocketService(context: BinanceWebSocketContext): Promise<void> {
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

  const exchangeInfo = await context.storage.exchangeInfo.readLastRecord(SYMBOL_ALL);

  if (!exchangeInfo) {
    throw new Error('Exchange info not found for binance, this is required for symbol mapping');
  }

  setBinanceLatestExchangeInfo(exchangeInfo.response);

  const symbols = config.SYMBOLS.split(',')
    .map((s) => unnormalizeToBinanceSymbol(s).trim())
    .filter((s) => !!s);
  const normalizedSymbols = symbols.map((s) => normalizeSymbol('binance', s));

  const BinanceWSDefinition = {
    tradeStream: BinanceWS.TradeStream,
    diffDepthStream: BinanceWS.DiffDepthStream,
  };
  const websocketManager = new BinanceWebsocketManager(
    context,
    createWSHandlers(BinanceWSDefinition, {
      tradeStream: async (message) => {
        const normalizedSymbol = normalizeSymbol('binance', message.data.s);
        const record = {
          id: context.storage.trade.getNextId(normalizedSymbol),
          timestamp: Date.now(),
          message,
        };
        await context.producers.binanceTrade.send(normalizedSymbol, record);
        context.storage.trade.appendRecord({
          subIndexDir: normalizedSymbol,
          record,
        });
      },
      diffDepthStream: async (message) => {
        const normalizedSymbol = normalizeSymbol('binance', message.data.s);
        const record = {
          id: context.storage.diffDepth.getNextId(normalizedSymbol),
          timestamp: new Date().getTime(),
          message,
        };
        await context.producers.binanceDiffDepth.send(normalizedSymbol, record);
        context.storage.diffDepth.appendRecord({
          subIndexDir: normalizedSymbol,
          record,
        });
      },
    }),
    {
      tradeStream: symbols.map((s) => BinanceWS.getTradeStreamSubscriptionName({ symbol: s })),
      diffDepthStream: symbols.map((s) =>
        BinanceWS.getDiffDepthStreamSubscriptionName({ symbol: s, time: '1000ms' }),
      ),
    },
  );

  diagnosticContext.logger.info('Starting websocket manager', { symbols });

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down websocket services');
      await websocketManager.disconnect();
      await context.producers.binanceTrade.close();
      await context.producers.binanceDiffDepth.close();
    });
  };

  registerGracefulShutdownCallback();

  await context.producers.binanceTrade.connect(normalizedSymbols);
  await context.producers.binanceDiffDepth.connect(normalizedSymbols);

  await websocketManager.connect();
  await websocketManager.subscribe();

  await saveBinanceOrderBookSnapshots(
    diagnosticContext,
    symbols,
    context.binanceClient.getOrderBook,
    context.storage.orderBook,
  );

  await httpServer.startServer();
}
