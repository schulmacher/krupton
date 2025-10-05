import { BinanceApi } from '@krupton/api-interface';
import { arrayToMultiMap, sleep } from '@krupton/utils';
import type { MdsFetcherContext } from '../../process/mdsFetcherProcess/context.js';
import { createMdsFetcherLoop } from './mdsFetcherLoop.js';
import type { MdsFetcherLoop } from './types.js';

interface CreateBinanceHistoricalTradesFetcherLoopsParams {
  context: MdsFetcherContext;
  symbols: string[];
}

interface HandleTradesResponseParams {
  query: BinanceApi.GetHistoricalTradesQuery;
  response: BinanceApi.GetHistoricalTradesResponse;
  context: MdsFetcherContext;
  endpoint: string;
  symbol: string;
}

const handleHistoricalTradesResponse = async ({
  query,
  response,
  context,
  endpoint,
  symbol,
}: HandleTradesResponseParams): Promise<void> => {
  const { diagnosticContext, processContext, envContext, storageIO } = context;
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
    await storageIO.readLatestRecord<BinanceApi.GetHistoricalTradesResponse>({
      platform: config.PLATFORM,
      endpoint,
      symbol,
    });

  const latestStoredFromId = currentLatestRecord?.params.query
    ? (currentLatestRecord.params.query as { fromId?: number }).fromId
    : undefined;

  if (
    requestFromId !== undefined &&
    latestStoredFromId !== undefined &&
    requestFromId <= latestStoredFromId
  ) {
    diagnosticContext.logger.warn('Skipping duplicate request - already in storage, shotting down process', {
      platform: config.PLATFORM,
      symbol,
      endpoint,
      requestFromId,
      latestStoredFromId,
    });
    // TODO implement restart logic, handled by PM2 naturally?
    await processContext.shutdown();
    return;
  }

  const partitionedByIndex = arrayToMultiMap(
    response,
    (trade: { id: number }) => `${Math.floor(trade.id / 1e5)}`,
  );

  const timestamp = Date.now();

  for (const [idx, trades] of partitionedByIndex.entries()) {
    await storageIO.appendRecord({
      platform: config.PLATFORM,
      endpoint,
      symbol,
      idx,
      record: {
        timestamp,
        endpoint,
        params: query,
        response: trades,
      },
    });

    diagnosticContext.logger.info('Response saved to storage', {
      platform: config.PLATFORM,
      symbol,
      endpoint,
      idx,
      requestFromId,
      recordCount: trades.length,
    });
  }
};

interface CreateFetcherLoopForSymbolParams {
  context: MdsFetcherContext;
  symbol: string;
  endpoint: string;
}

const createBinanceHistoricalTradesFetcherLoopForSymbol = async ({
  context,
  symbol,
  endpoint,
}: CreateFetcherLoopForSymbolParams): Promise<MdsFetcherLoop> => {
  const { diagnosticContext, envContext, binanceClient, storageIO } = context;
  const config = envContext.config;

  const latestStorageRecord =
    await storageIO.readLatestRecord<BinanceApi.GetHistoricalTradesResponse>({
      platform: config.PLATFORM,
      endpoint,
      symbol,
    });
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
      handleHistoricalTradesResponse({
        query,
        response,
        context,
        endpoint,
        symbol,
      }),
  });
};

export const createBinanceHistoricalTradesFetcherLoops = async ({
  context,
  symbols,
}: CreateBinanceHistoricalTradesFetcherLoopsParams): Promise<MdsFetcherLoop[]> => {
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
      }

      return createBinanceHistoricalTradesFetcherLoopForSymbol({
        context: childContext,
        symbol,
        endpoint,
      });
    }),
  );

  return fetcherLoops;
};
