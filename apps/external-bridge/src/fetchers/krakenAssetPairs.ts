import { KrakenApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import type { KrakenFetcherContext } from '../process/fetcherProcess/krakenFetcherContext.js';

const FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function handleAssetPairsResponse(
  context: KrakenFetcherContext,
  query: KrakenApi.GetAssetPairsQuery,
  response: KrakenApi.GetAssetPairsResponse,
): Promise<void> {
  const { diagnosticContext, krakenAssetPairs } = context;

  await krakenAssetPairs.write({
    request: { query },
    response,
  });

  diagnosticContext.logger.debug('Asset pairs saved to storage', {
    pairCount: Object.keys(response.result).length,
  });
}

export async function createKrakenAssetPairsFetcherLoop(
  context: KrakenFetcherContext,
): Promise<ExternalBridgeFetcherLoop> {
  const { diagnosticContext, envContext, krakenClient, krakenAssetPairs } = context;
  const config = envContext.config;
  const endpoint = krakenClient.getAssetPairs.definition.path;
  const platform = config.PLATFORM;

  diagnosticContext.logger.info('Initializing asset pairs fetcher', {
    platform,
    endpoint,
    fetchInterval: `${FETCH_INTERVAL_MS / 1000}s`,
  });

  return createExternalBridgeFetcherLoop<typeof KrakenApi.GetAssetPairsEndpoint>(context, {
    symbol: 'ALL',
    endpointFn: krakenClient.getAssetPairs,
    buildRequestParams: async () => {
      const latestRecord = await krakenAssetPairs.readLatestRecord();

      if (latestRecord) {
        const timeSinceLastFetch = Date.now() - latestRecord.timestamp;
        const timeUntilNextFetch = FETCH_INTERVAL_MS - timeSinceLastFetch;

        if (timeUntilNextFetch > 0) {
          diagnosticContext.logger.info('Waiting for next scheduled fetch', {
            platform,
            endpoint,
            timeSinceLastFetchMinutes: Math.floor(timeSinceLastFetch / 60000),
            waitTimeMinutes: Math.floor(timeUntilNextFetch / 60000),
          });
          await sleep(timeUntilNextFetch);
        }
      }

      return {
        query: {},
      };
    },
    onSuccess: async ({ query, response }) => handleAssetPairsResponse(context, query, response),
  });
}

