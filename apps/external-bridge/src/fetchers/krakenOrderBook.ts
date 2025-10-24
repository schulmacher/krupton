import { KrakenApi } from '@krupton/api-interface';
import type { KrakenFetcherContext } from '../process/fetcherProcess/krakenFetcherContext.js';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import { normalizeSymbol } from '../lib/symbol/normalizeSymbol.js';

async function handleOrderBookResponse(
  query: KrakenApi.GetOrderBookQuery,
  response: KrakenApi.GetOrderBookResponse,
  context: KrakenFetcherContext,
  symbol: string,
): Promise<void> {
  const { diagnosticContext, storage } = context;

  const normalizedSymbol = normalizeSymbol('kraken', symbol);

  await storage.orderBook.appendRecord({
    subIndex: normalizedSymbol,
    record: {
      request: { query },
      response,
      timestamp: Date.now(),
    },
  });

  const pairKey = Object.keys(response.result)[0];
  const orderBookData = response.result[pairKey];

  diagnosticContext.logger.debug('Order book saved to storage', {
    symbol: normalizedSymbol,
    bidsCount: orderBookData?.bids?.length ?? 0,
    asksCount: orderBookData?.asks?.length ?? 0,
  });
}

async function createKrakenOrderBookFetcherLoopForSymbol(
  context: KrakenFetcherContext,
  symbol: string,
  count = 100,
): Promise<ExternalBridgeFetcherLoop> {
  const { diagnosticContext, krakenClient } = context;

  diagnosticContext.logger.info('Order book fetcher initialized', {
    symbol,
    count,
  });

  return createExternalBridgeFetcherLoop<typeof KrakenApi.GetOrderBookEndpoint>(context, {
    symbol,
    endpointFn: krakenClient.getOrderBook,
    buildRequestParams: () => {
      const nextQuery: KrakenApi.GetOrderBookQuery = {
        pair: symbol,
        count,
      };

      return {
        query: nextQuery,
      };
    },
    onSuccess: async ({ query, response }) =>
      handleOrderBookResponse(query, response, context, symbol),
  });
}

interface CreateKrakenOrderBookFetcherLoopsOptions {
  count?: number;
}

export async function createKrakenOrderBookFetcherLoops(
  context: KrakenFetcherContext,
  symbols: string[],
  options?: CreateKrakenOrderBookFetcherLoopsOptions,
): Promise<ExternalBridgeFetcherLoop[]> {
  const fetcherLoops = await Promise.all(
    symbols.map((symbol) => {
      const childContext: KrakenFetcherContext = {
        ...context,
        diagnosticContext: {
          ...context.diagnosticContext,
          logger: context.diagnosticContext.createChildLogger(symbol),
        },
      };

      return createKrakenOrderBookFetcherLoopForSymbol(childContext, symbol, options?.count ?? 100);
    }),
  );

  return fetcherLoops;
}
