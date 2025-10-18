import { SF } from '@krupton/service-framework-node';
import { createKrakenAssetInfoFetcherLoop } from '../../fetchers/krakenAsset.js';
import { createKrakenAssetPairsFetcherLoop } from '../../fetchers/krakenAssetPairs.js';
import { createKrakenRecentTradesFetcherLoops } from '../../fetchers/krakenRecentTrades.js';
import { initAndDownloadKrakenLatestAssetPairsProvider } from '../../lib/symbol/krakenLatestAssetsProvider.js';
import { normalizeSymbol, unnormalizeToKrakenALTSymbol } from '../../lib/symbol/normalizeSymbol.js';
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
    context.storage.assetPairs,
    context.storage.assetInfo,
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

  for (const producer of Object.values(context.producers)) {
    await producer.connect(krakenSymbols.map((s) => normalizeSymbol('kraken', s)));
  }

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down fetcher services');
      await Promise.all(fetcherLoops.map((service) => service.stop()));
      for (const producer of Object.values(context.producers)) {
        await producer.close();
      }
    });
  };
  registerGracefulShutdownCallback();

  await httpServer.startServer();
  await Promise.all(fetcherLoops.map((service) => service.start()));
}
