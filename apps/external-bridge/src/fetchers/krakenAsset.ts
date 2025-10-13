import { KrakenApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import type { KrakenFetcherContext } from '../process/fetcherProcess/krakenFetcherContext.js';

const FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function handleAssetInfoResponse(
  context: KrakenFetcherContext,
  query: KrakenApi.GetAssetInfoQuery,
  response: KrakenApi.GetAssetInfoResponse,
): Promise<void> {
  const { diagnosticContext, krakenAssetInfo } = context;

  await krakenAssetInfo.write({
    request: { query },
    response,
  });

  diagnosticContext.logger.debug('Asset info saved to storage', {
    assetCount: Object.keys(response.result).length,
  });
}

export async function createKrakenAssetInfoFetcherLoop(
  context: KrakenFetcherContext,
): Promise<ExternalBridgeFetcherLoop> {
  const { diagnosticContext, envContext, krakenClient, krakenAssetInfo } = context;
  const config = envContext.config;
  const endpoint = krakenClient.getAssetInfo.definition.path;
  const platform = config.PLATFORM;

  diagnosticContext.logger.info('Initializing asset info fetcher', {
    platform,
    endpoint,
    fetchInterval: `${FETCH_INTERVAL_MS / 1000}s`,
  });

  return createExternalBridgeFetcherLoop<typeof KrakenApi.GetAssetInfoEndpoint>(context, {
    symbol: 'ALL',
    endpointFn: krakenClient.getAssetInfo,
    buildRequestParams: async () => {
      const latestRecord = await krakenAssetInfo.readLatestRecord();

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
    onSuccess: async ({ query, response }) => handleAssetInfoResponse(context, query, response),
  });
}

