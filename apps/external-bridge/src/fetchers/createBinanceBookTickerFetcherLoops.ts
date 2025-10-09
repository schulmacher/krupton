import { BinanceApi } from '@krupton/api-interface';
import type { MdsFetcherContext } from '../process/fetcherProcess/context.js';
import { createMdsFetcherLoop } from '../lib/mdsFetcher/mdsFetcherLoop.js';
import type { MdsFetcherLoop } from '../lib/mdsFetcher/types.js';

const handleBookTickerResponse = async (
  context: MdsFetcherContext,
  query: BinanceApi.GetBookTickerQuery,
  response: BinanceApi.GetBookTickerResponse,
  symbol: string,
): Promise<void> => {
  const { diagnosticContext, endpointStorageRepository } = context;

  const bookTickerData = Array.isArray(response) ? response : [response];
  const targetBookTicker = bookTickerData.find((ticker) => ticker.symbol === symbol);

  if (!targetBookTicker) {
    diagnosticContext.logger.warn('Symbol not found in response', {
      symbol,
    });
    return;
  }

  await endpointStorageRepository.binanceBookTicker.write({
    request: { query },
    response: targetBookTicker,
  });

  diagnosticContext.logger.debug('Book ticker saved to storage', {
    symbol,
  });
};

const createBinanceBookTickerFetcherLoopForSymbol = async (
  context: MdsFetcherContext,
  symbol: string,
): Promise<MdsFetcherLoop> => {
  const { diagnosticContext, envContext, binanceClient } = context;
  const config = envContext.config;

  diagnosticContext.logger.info('Book ticker fetcher initialized', {
    platform: config.PLATFORM,
    symbol,
  });

  return createMdsFetcherLoop<typeof BinanceApi.GetBookTickerEndpoint>(context, {
    symbol,
    endpointFn: binanceClient.getBookTicker,
    buildRequestParams: () => {
      const nextQuery: BinanceApi.GetBookTickerQuery = {
        symbol,
      };

      return {
        query: nextQuery,
      };
    },
    onSuccess: async ({ query, response }) =>
      handleBookTickerResponse(context, query, response, symbol),
  });
};

export const createBinanceBookTickerFetcherLoops = async (
  context: MdsFetcherContext,
  symbols: string[],
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

      return createBinanceBookTickerFetcherLoopForSymbol(childContext, symbol);
    }),
  );

  return fetcherLoops;
};
