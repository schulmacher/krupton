import { SF } from '@krupton/service-framework-node';
import { createKrakenAssetInfoFetcherLoop } from '../../fetchers/createKrakenAssetInfoFetcherLoop.js';
import { createKrakenAssetPairsFetcherLoop } from '../../fetchers/createKrakenAssetPairsFetcherLoop.js';
import { createKrakenRecentTradesFetcherLoops } from '../../fetchers/createKrakenRecentTradesFetcherLoops.js';
import { initAndDownloadKrakenLatestAssetPairsProvider } from '../../lib/symbol/krakenLatestAssetsProvider.js';
import { unnormalizeToKrakenALTSymbol } from '../../lib/symbol/normalizeSymbol.js';
import type { KrakenFetcherContext } from './krakenFetcherContext.js';

export async function startKrakenFetcherService(context: KrakenFetcherContext): Promise<void> {
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

  await initAndDownloadKrakenLatestAssetPairsProvider(
    context.endpointStorageRepository.krakenAssetPairs,
    context.endpointStorageRepository.krakenAssetInfo,
    context.krakenClient.getAssetPairs,
    context.krakenClient.getAssetInfo,
  );

  const krakenSymbols = config.SYMBOLS.split(',')
    .map((s) => unnormalizeToKrakenALTSymbol(s).trim())
    .filter((s) => !!s);

  context.metricsContext.metrics.totalFetchesGauge.set(0);
  context.metricsContext.metrics.lastFetchTimestampGauge.set(0);
  context.metricsContext.metrics.totalErrorsGauge.set(0);
  context.metricsContext.metrics.activeSymbolsGauge.set(krakenSymbols.length);

  const fetcherLoops = [
    await createKrakenAssetPairsFetcherLoop(context),
    await createKrakenAssetInfoFetcherLoop(context),
    ...(await createKrakenRecentTradesFetcherLoops(context, krakenSymbols)),
    // ...(await createKrakenOrderBookFetcherLoops(context, krakenSymbols)),
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
