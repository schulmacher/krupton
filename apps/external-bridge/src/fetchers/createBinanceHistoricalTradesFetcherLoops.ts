import { BinanceApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import type { MdsFetcherContext } from '../process/fetcherProcess/context.js';
import { createMdsFetcherLoop } from '../lib/mdsFetcher/mdsFetcherLoop.js';
import type { MdsFetcherLoop } from '../lib/mdsFetcher/types.js';

const handleHistoricalTradesResponse = async (
  context: MdsFetcherContext,
  query: BinanceApi.GetHistoricalTradesQuery,
  response: BinanceApi.GetHistoricalTradesResponse,
  endpoint: string,
  symbol: string,
): Promise<void> => {
  const { diagnosticContext, processContext, envContext, endpointStorageRepository } = context;
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
  const currentLatestRecord =
    await endpointStorageRepository.binanceHistoricalTrade.readLatestRecord(symbol);

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

  await endpointStorageRepository.binanceHistoricalTrade.write({
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
  context: MdsFetcherContext,
  symbol: string,
  endpoint: string,
): Promise<MdsFetcherLoop> => {
  const { diagnosticContext, envContext, binanceClient, endpointStorageRepository } = context;
  const config = envContext.config;

  const latestStorageRecord =
    await endpointStorageRepository.binanceHistoricalTrade.readLatestRecord(symbol);
  const latestStorageRecordMaxId = latestStorageRecord?.response?.reduce(
    (acc: number, curr: { id: number }) => Math.max(acc, curr.id),
    0,
  );

  diagnosticContext.logger.info('Latest record loaded', {
    platform: config.PLATFORM,
    symbol,
    endpoint,
    hasRecord: !!latestStorageRecord,
    latestStorageRecordMaxId,
    recordTimestamp: latestStorageRecord?.timestamp,
    recordCount: latestStorageRecord?.response
      ? Array.isArray(latestStorageRecord.response)
        ? latestStorageRecord.response.length
        : 1
      : 0,
  });

  return createMdsFetcherLoop<typeof BinanceApi.GetHistoricalTradesEndpoint>(context, {
    symbol,
    endpointFn: binanceClient.getHistoricalTrades,
    buildRequestParams: ({ prevResponse: lastResponse, prevParams: lastParams }) => {
      const prevResponseMaxId = lastResponse
        ? lastResponse.reduce((acc: number, curr: { id: number }) => Math.max(acc, curr.id), 0)
        : undefined;
      const prevId = prevResponseMaxId ?? latestStorageRecordMaxId;
      const queryFromId = prevId ? prevId + 1 : 0;
      const nextQuery: BinanceApi.GetHistoricalTradesQuery = {
        symbol,
        limit: 100,
        fromId: queryFromId,
      };

      if (lastResponse && lastResponse.length === 0) {
        return lastParams ? lastParams : { query: nextQuery };
      }

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
  context: MdsFetcherContext,
  symbols: string[],
): Promise<MdsFetcherLoop[]> => {
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
