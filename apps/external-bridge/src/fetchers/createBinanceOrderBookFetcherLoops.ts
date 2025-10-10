import { BinanceApi } from '@krupton/api-interface';
import type { BinanceFetcherContext } from '../process/fetcherProcess/binanceFetcherContext.js';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';

const handleOrderBookResponse = async (
  query: BinanceApi.GetOrderBookQuery,
  response: BinanceApi.GetOrderBookResponse,
  context: BinanceFetcherContext,
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
  context: BinanceFetcherContext,
  symbol: string,
  limit = 100,
): Promise<ExternalBridgeFetcherLoop> => {
  const { diagnosticContext, binanceClient } = context;

  diagnosticContext.logger.info('Order book fetcher initialized', {
    symbol,
    limit,
  });

  return createExternalBridgeFetcherLoop<typeof BinanceApi.GetOrderBookEndpoint>(context, {
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
  context: BinanceFetcherContext,
  symbols: string[],
  options?: CreateBinanceOrderBookFetcherLoopsOptions,
): Promise<ExternalBridgeFetcherLoop[]> => {
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
