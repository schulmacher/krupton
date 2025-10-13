import { BinanceApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import type { BinanceFetcherContext } from '../process/fetcherProcess/binanceFetcherContext.js';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';

const handleHistoricalTradesResponse = async (
  context: BinanceFetcherContext,
  query: BinanceApi.GetHistoricalTradesQuery,
  response: BinanceApi.GetHistoricalTradesResponse,
  endpoint: string,
  symbol: string,
): Promise<void> => {
  const { diagnosticContext, processContext, envContext, binanceHistoricalTrade } = context;
  const config = envContext.config;

  if (!response || response.length === 0) {
    diagnosticContext.logger.debug('Empty response', {
      platform: config.PLATFORM,
      symbol,
      endpoint,
    });
    await sleep(1000);
    return;
  }

  const requestFromId = query.fromId;
  const currentLatestRecord = await binanceHistoricalTrade.readLatestRecord(symbol);

  const latestStoredFromId = currentLatestRecord?.request.query?.fromId;

  if (
    requestFromId !== undefined &&
    latestStoredFromId !== undefined &&
    requestFromId <= latestStoredFromId
  ) {
    diagnosticContext.logger.warn(
      'Skipping duplicate request - already in storage, shotting down process',
      {
        platform: config.PLATFORM,
        symbol,
        endpoint,
        requestFromId,
        latestStoredFromId,
      },
    );
    // TODO implement restart logic, handled by PM2 naturally?
    await processContext.shutdown();
    return;
  }

  await binanceHistoricalTrade.write({
    request: { query },
    response,
  });

  diagnosticContext.logger.debug('Response saved to storage', {
    platform: config.PLATFORM,
    symbol,
    endpoint,
    requestFromId,
    recordCount: response.length,
  });
};

const createBinanceHistoricalTradesFetcherLoopForSymbol = async (
  context: BinanceFetcherContext,
  symbol: string,
  endpoint: string,
): Promise<ExternalBridgeFetcherLoop> => {
  const { binanceClient, binanceHistoricalTrade } = context;

  return createExternalBridgeFetcherLoop<typeof BinanceApi.GetHistoricalTradesEndpoint>(context, {
    symbol,
    endpointFn: binanceClient.getHistoricalTrades,
    buildRequestParams: async () => {
      const latestRecord = await binanceHistoricalTrade.readLatestRecord(symbol);
      const latestRecordMaxId = latestRecord?.response?.reduce(
        (acc: number, curr: { id: number }) => Math.max(acc, curr.id),
        0,
      );

      const queryFromId = latestRecordMaxId ? latestRecordMaxId + 1 : 1;

      return {
        query: {
          symbol,
          limit: 100,
          fromId: queryFromId,
        },
      };
    },
    onSuccess: async ({ query, response }) =>
      handleHistoricalTradesResponse(context, query, response, endpoint, symbol),
  });
};

export const createBinanceHistoricalTradesFetcherLoops = async (
  context: BinanceFetcherContext,
  symbols: string[],
): Promise<ExternalBridgeFetcherLoop[]> => {
  const { binanceClient } = context;
  const endpoint = binanceClient.getHistoricalTrades.definition.path;

  const fetcherLoops = await Promise.all(
    symbols.map((symbol) => {
      const childContext = {
        ...context,
        diagnosticContext: {
          ...context.diagnosticContext,
          logger: context.diagnosticContext.createChildLogger(symbol),
        },
      };

      return createBinanceHistoricalTradesFetcherLoopForSymbol(childContext, symbol, endpoint);
    }),
  );

  return fetcherLoops;
};
