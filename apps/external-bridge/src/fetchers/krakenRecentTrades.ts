import { KrakenApi } from '@krupton/api-interface';
import { sleep } from '@krupton/utils';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import type { KrakenFetcherContext } from '../process/fetcherProcess/krakenFetcherContext.js';
import { normalizeSymbol } from '../lib/symbol/normalizeSymbol.js';

function extractLastTradeId(response: KrakenApi.GetRecentTradesResponse): string | undefined {
  return response.result.last;
}

function hasData(response: KrakenApi.GetRecentTradesResponse): boolean {
  const result: Record<string, unknown> = response.result;
  for (const key of Object.keys(result)) {
    if (key === 'last') {
      continue;
    }
    const value = result[key];
    if (Array.isArray(value) && value.length > 0) {
      return true;
    }
  }
  return false;
}

async function handleRecentTradesResponse(
  context: KrakenFetcherContext,
  query: KrakenApi.GetRecentTradesQuery,
  response: KrakenApi.GetRecentTradesResponse,
  endpoint: string,
  symbol: string,
): Promise<void> {
  const { diagnosticContext, envContext, storage } = context;
  const config = envContext.config;

  if (!hasData(response)) {
    diagnosticContext.logger.debug('Empty response', {
      platform: config.PLATFORM,
      symbol,
      endpoint,
    });
    await sleep(1000);
    return;
  }

  const normalizedSymbol = normalizeSymbol('kraken', symbol);
  const requestSince = query.since;

  await storage.recentTrades.appendRecord({
    subIndexDir: normalizedSymbol,
    record: {
      request: { query },
      response,
      timestamp: Date.now(),
      id: storage.recentTrades.getNextId(normalizedSymbol),
    },
  });

  diagnosticContext.logger.debug('Response saved to storage', {
    platform: config.PLATFORM,
    symbol: normalizedSymbol,
    endpoint,
    requestSince,
  });
}

async function createKrakenRecentTradesFetcherLoopForSymbol(
  context: KrakenFetcherContext,
  symbol: string,
  endpoint: string,
): Promise<ExternalBridgeFetcherLoop> {
  const { krakenClient, storage } = context;

  return createExternalBridgeFetcherLoop<typeof KrakenApi.GetRecentTradesEndpoint>(context, {
    symbol,
    endpointFn: krakenClient.getRecentTrades,
    buildRequestParams: async () => {
      const normalizedSymbol = normalizeSymbol('kraken', symbol);
      const latestRecord = await storage.recentTrades.readLastRecord(normalizedSymbol);
      const latestRecordLastId = latestRecord
        ? extractLastTradeId(latestRecord.response)
        : undefined;

      const querySince = latestRecordLastId ?? '0';

      const nextQuery: KrakenApi.GetRecentTradesQuery = {
        pair: symbol,
        count: 100,
        since: querySince,
      };

      return {
        query: nextQuery,
      };
    },
    onSuccess: async ({ query, response }) =>
      handleRecentTradesResponse(context, query, response, endpoint, symbol),
  });
}

export async function createKrakenRecentTradesFetcherLoops(
  context: KrakenFetcherContext,
  symbols: string[],
): Promise<ExternalBridgeFetcherLoop[]> {
  const { krakenClient } = context;
  const endpoint = krakenClient.getRecentTrades.definition.path;

  const fetcherLoops = await Promise.all(
    symbols.map((symbol) => {
      const childContext: KrakenFetcherContext = {
        ...context,
        diagnosticContext: {
          ...context.diagnosticContext,
          logger: context.diagnosticContext.createChildLogger(symbol),
        },
      };

      return createKrakenRecentTradesFetcherLoopForSymbol(childContext, symbol, endpoint);
    }),
  );

  return fetcherLoops;
}
