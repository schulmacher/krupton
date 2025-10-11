import { SF } from '@krupton/service-framework-node';
import { createBinanceExchangeInfoFetcherLoop } from '../../fetchers/createBinanceExchangeInfoFetcherLoop.js';
import { createBinanceHistoricalTradesFetcherLoops } from '../../fetchers/createBinanceHistoricalTradesFetcherLoops.js';
import { initBinanceLatestExchangeInfoProvider } from '../../lib/symbol/binanceLatestExchangeInfoProvider.js';
import { unnormalizeToBinanceSymbol } from '../../lib/symbol/normalizeSymbol.js';
import type { BinanceFetcherContext } from './binanceFetcherContext.js';

export async function startExternalBridgeFetcherService(
  context: BinanceFetcherContext,
): Promise<void> {
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

  const binanceSymbols = config.SYMBOLS.split(',')
    .map((s) => unnormalizeToBinanceSymbol(s).trim())
    .filter((s) => !!s);

  context.metricsContext.metrics.totalFetchesGauge.set(0);
  context.metricsContext.metrics.lastFetchTimestampGauge.set(0);
  context.metricsContext.metrics.totalErrorsGauge.set(0);
  context.metricsContext.metrics.activeSymbolsGauge.set(binanceSymbols.length);

  await initBinanceLatestExchangeInfoProvider(
    context.endpointStorageRepository.binanceExchangeInfo,
    context.binanceClient.getExchangeInfo,
  );

  const fetcherLoops = [
    ...(await createBinanceHistoricalTradesFetcherLoops(context, binanceSymbols)),
    // ...(await createBinanceBookTickerFetcherLoops(context, binanceSymbols)),
    // ...(await createBinanceOrderBookFetcherLoops(context, binanceSymbols)),
    await createBinanceExchangeInfoFetcherLoop(context),
  ];

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down fetcher services');
      await Promise.all(fetcherLoops.map((service) => service.stop()));
    });
  };
  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
  await Promise.all(fetcherLoops.map((service) => service.start()));
}
