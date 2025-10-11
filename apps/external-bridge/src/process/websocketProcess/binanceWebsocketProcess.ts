import { SF } from '@krupton/service-framework-node';

import { createWSHandlers } from '@krupton/api-client-ws-node';
import { BinanceWS } from '@krupton/api-interface';
import { saveBinanceOrderBookSnapshots } from '../../fetchers/binanceOrderBook.js';
import { setBinanceLatestExchangeInfo } from '../../lib/symbol/binanceLatestExchangeInfoProvider.js';
import { unnormalizeToBinanceSymbol } from '../../lib/symbol/normalizeSymbol.js';
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

  const exchangeInfo =
    await context.endpointStorageRepository.binanceExchangeInfo.readLatestRecord();

  if (!exchangeInfo) {
    throw new Error('Exchange info not found for binance, this is required for symbol mapping');
  }

  setBinanceLatestExchangeInfo(exchangeInfo.response);

  const symbols = config.SYMBOLS.split(',')
    .map((s) => unnormalizeToBinanceSymbol(s).trim())
    .filter((s) => !!s);

  const BinanceWSDefinition = {
    tradeStream: BinanceWS.TradeStream,
    diffDepthStream: BinanceWS.DiffDepthStream,
  };
  const websocketManager = new BinanceWebsocketManager(
    context,
    createWSHandlers(BinanceWSDefinition, {
      tradeStream: (message) => {
        context.websocketStorageRepository.binanceTrade.write({
          message,
        });
      },
      diffDepthStream: (message) => {
        context.websocketStorageRepository.binanceDiffDepth.write({
          message,
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
    });
  };

  registerGracefulShutdownCallback();
  processContext.start();

  await websocketManager.connect();
  await websocketManager.subscribe();

  await saveBinanceOrderBookSnapshots(
    diagnosticContext,
    symbols,
    context.binanceClient.getOrderBook,
    context.endpointStorageRepository.binanceOrderBook.write,
  );

  await httpServer.startServer();
}
