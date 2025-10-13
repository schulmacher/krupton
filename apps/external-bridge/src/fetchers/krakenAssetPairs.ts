import { KrakenApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import type { KrakenFetcherContext } from '../process/fetcherProcess/krakenFetcherContext.js';
import { SYMBOL_ALL } from '@krupton/persistent-storage-node';

const FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function handleAssetPairsResponse(
  context: KrakenFetcherContext,
  query: KrakenApi.GetAssetPairsQuery,
  response: KrakenApi.GetAssetPairsResponse,
): Promise<void> {
  const { diagnosticContext, storage } = context;

  const lastAssetPairs = await storage.assetPairs.readLastRecord(SYMBOL_ALL);

  if (lastAssetPairs && JSON.stringify(lastAssetPairs.response.result) === JSON.stringify(response.result)) {
    diagnosticContext.logger.info('Asset pairs already in storage', {
      pairCount: Object.keys(response.result).length,
    });
    return;
  }

  await storage.assetPairs.appendRecord({
    subIndexDir: SYMBOL_ALL,
    record: {
      request: { query },
      response,
      timestamp: Date.now(),
      id: storage.assetPairs.getNextId(SYMBOL_ALL),
    },
  });

  diagnosticContext.logger.debug('Asset pairs saved to storage', {
    pairCount: Object.keys(response.result).length,
  });
}

export async function createKrakenAssetPairsFetcherLoop(
  context: KrakenFetcherContext,
): Promise<ExternalBridgeFetcherLoop> {
  const { diagnosticContext, envContext, krakenClient, storage } = context;
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
      const latestRecord = await storage.assetPairs.readLastRecord(SYMBOL_ALL);

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

