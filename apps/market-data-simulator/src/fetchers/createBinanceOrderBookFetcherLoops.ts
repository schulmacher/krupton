import { BinanceApi } from '@krupton/api-interface';
import type { MdsFetcherContext } from '../process/mdsFetcherProcess/context.js';
import { createMdsFetcherLoop } from '../lib/mdsFetcher/mdsFetcherLoop.js';
import type { MdsFetcherLoop } from '../lib/mdsFetcher/types.js';

const handleOrderBookResponse = async (
  query: BinanceApi.GetOrderBookQuery,
  response: BinanceApi.GetOrderBookResponse,
  context: MdsFetcherContext,
  symbol: string,
): Promise<void> => {
  const { diagnosticContext, endpointStorageRepository } = context;

  await endpointStorageRepository.binanceOrderBook.write({
    request: { query },
    response,
  });

  diagnosticContext.logger.debug('Order book saved to storage', {
    symbol,
    bidsCount: response.bids.length,
    asksCount: response.asks.length,
  });
};

const createBinanceOrderBookFetcherLoopForSymbol = async (
  context: MdsFetcherContext,
  symbol: string,
  limit = 100,
): Promise<MdsFetcherLoop> => {
  const { diagnosticContext, binanceClient } = context;

  diagnosticContext.logger.info('Order book fetcher initialized', {
    symbol,
    limit,
  });

  return createMdsFetcherLoop<typeof BinanceApi.GetOrderBookEndpoint>(context, {
    symbol,
    endpointFn: binanceClient.getOrderBook,
    buildRequestParams: () => {
      const nextQuery: BinanceApi.GetOrderBookQuery = {
        symbol,
        limit,
      };

      return {
        query: nextQuery,
      };
    },
    onSuccess: async ({ query, response }) =>
      handleOrderBookResponse(query, response, context, symbol),
  });
};

interface CreateBinanceOrderBookFetcherLoopsOptions {
  limit?: number;
}

export const createBinanceOrderBookFetcherLoops = async (
  context: MdsFetcherContext,
  symbols: string[],
  options?: CreateBinanceOrderBookFetcherLoopsOptions,
): Promise<MdsFetcherLoop[]> => {
  const fetcherLoops = await Promise.all(
    symbols.map((symbol) => {
      const childContext = {
        ...context,
        diagnosticContext: {
          ...context.diagnosticContext,
          logger: context.diagnosticContext.createChildLogger(symbol),
        },
      };

      return createBinanceOrderBookFetcherLoopForSymbol(
        childContext,
        symbol,
        options?.limit ?? 100,
      );
    }),
  );

  return fetcherLoops;
};
