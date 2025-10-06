import { BinanceApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import type { MdsFetcherContext } from '../process/mdsFetcherProcess/context.js';
import { createMdsFetcherLoop } from '../lib/mdsFetcher/mdsFetcherLoop.js';
import type { MdsFetcherLoop } from '../lib/mdsFetcher/types.js';

const FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const handleExchangeInfoResponse = async (
  context: MdsFetcherContext,
  query: BinanceApi.GetExchangeInfoQuery,
  response: BinanceApi.GetExchangeInfoResponse,
): Promise<void> => {
  const { diagnosticContext, endpointStorageRepository } = context;

  await endpointStorageRepository.binanceExchangeInfo.write({
    request: { query },
    response,
  });

  diagnosticContext.logger.debug('Exchange info saved to storage', {
    symbolCount: response.symbols.length,
  });
};

export const createBinanceExchangeInfoFetcherLoop = async (
  context: MdsFetcherContext,
): Promise<MdsFetcherLoop> => {
  const { diagnosticContext, envContext, binanceClient, endpointStorageRepository } = context;
  const config = envContext.config;
  const endpoint = binanceClient.getExchangeInfo.definition.path;
  const platform = config.PLATFORM;

  diagnosticContext.logger.info('Initializing exchange info fetcher', {
    platform,
    endpoint,
    fetchInterval: `${FETCH_INTERVAL_MS / 1000}s`,
  });

  return createMdsFetcherLoop<typeof BinanceApi.GetExchangeInfoEndpoint>(context, {
    symbol: 'ALL',
    endpointFn: binanceClient.getExchangeInfo,
    buildRequestParams: async () => {
      const latestRecord = await endpointStorageRepository.binanceExchangeInfo.readLatestRecord();

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
    onSuccess: async ({ query, response }) =>
      handleExchangeInfoResponse(context, query, response),
  });
};
