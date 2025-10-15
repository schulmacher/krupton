import { BinanceApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import { BinanceFetcherContext } from '../process/fetcherProcess/binanceFetcherContext.js';
import { isSameExchangeInfoResponse, SYMBOL_ALL } from '@krupton/persistent-storage-node';

const FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const handleExchangeInfoResponse = async (
  context: BinanceFetcherContext,
  query: BinanceApi.GetExchangeInfoQuery,
  response: BinanceApi.GetExchangeInfoResponse,
): Promise<void> => {
  const { diagnosticContext, storage } = context;
  const latestRecord = await storage.exchangeInfo.readLastRecord(SYMBOL_ALL);

  if (latestRecord && isSameExchangeInfoResponse(latestRecord.response, response)) {
    diagnosticContext.logger.info('Exchange info already in storage', {
      symbolCount: response.symbols.length,
    });
    await storage.exchangeInfo.replaceOrInsertLastRecord({
      subIndexDir: SYMBOL_ALL,
      record: {
        request: { query },
        response,
        timestamp: Date.now(),
      },
    });
    return;
  }

  await storage.exchangeInfo.appendRecord({
    subIndexDir: SYMBOL_ALL,
    record: {
      id: storage.exchangeInfo.getNextId(SYMBOL_ALL),
      timestamp: Date.now(),
      request: { query },
      response,
    },
  });

  diagnosticContext.logger.debug('Exchange info saved to storage', {
    symbolCount: response.symbols.length,
  });
};

export const createBinanceExchangeInfoFetcherLoop = async (
  context: BinanceFetcherContext,
): Promise<ExternalBridgeFetcherLoop> => {
  const { diagnosticContext, envContext, binanceClient, storage } = context;
  const config = envContext.config;
  const endpoint = binanceClient.getExchangeInfo.definition.path;
  const platform = config.PLATFORM;

  diagnosticContext.logger.info('Initializing exchange info fetcher', {
    platform,
    endpoint,
    fetchInterval: `${FETCH_INTERVAL_MS / 1000}s`,
  });

  return createExternalBridgeFetcherLoop<typeof BinanceApi.GetExchangeInfoEndpoint>(context, {
    symbol: 'ALL',
    endpointFn: binanceClient.getExchangeInfo,
    buildRequestParams: async () => {
      const latestRecord = await storage.exchangeInfo.readLastRecord(SYMBOL_ALL);

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
    onSuccess: async ({ query, response }) => handleExchangeInfoResponse(context, query, response),
  });
};
