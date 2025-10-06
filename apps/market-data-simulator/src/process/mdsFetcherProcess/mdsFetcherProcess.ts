import { SF } from '@krupton/service-framework-node';
import { createBinanceBookTickerFetcherLoops } from '../../fetchers/createBinanceBookTickerFetcherLoops.js';
import { createBinanceExchangeInfoFetcherLoop } from '../../fetchers/createBinanceExchangeInfoFetcherLoop.js';
import { createBinanceHistoricalTradesFetcherLoops } from '../../fetchers/createBinanceHistoricalTradesFetcherLoops.js';
import { createBinanceOrderBookFetcherLoops } from '../../fetchers/createBinanceOrderBookFetcherLoops.js';
import type { MdsFetcherContext } from './context.js';

export const startMdsFetcherService = async (context: MdsFetcherContext): Promise<void> => {
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

  const symbols = config.SYMBOLS.split(',')
    .map((s) => s.trim())
    .filter((s) => !!s);


  context.metricsContext.metrics.totalFetchesGauge.set(0);
  context.metricsContext.metrics.lastFetchTimestampGauge.set(0);
  context.metricsContext.metrics.totalErrorsGauge.set(0);
  context.metricsContext.metrics.activeSymbolsGauge.set(symbols.length);

  const fetcherLoops = [
    ...(await createBinanceHistoricalTradesFetcherLoops(context, symbols)),
    ...(await createBinanceBookTickerFetcherLoops(context, symbols)),
    ...(await createBinanceOrderBookFetcherLoops(context, symbols)),
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
};
