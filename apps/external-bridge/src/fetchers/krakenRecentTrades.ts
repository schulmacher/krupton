import { KrakenApi } from '@krupton/api-interface';
import { KrakenRecentTradesRecord } from '@krupton/persistent-storage-node';
import { sleep } from '@krupton/utils';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import { normalizeSymbol } from '../lib/symbol/normalizeSymbol.js';
import type { KrakenFetcherContext } from '../process/fetcherProcess/krakenFetcherContext.js';

function extractQueryNext(response: KrakenApi.GetRecentTradesResponse): string | undefined {
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
  const { diagnosticContext, envContext, storage, producers } = context;
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

  const record = {
    request: { query },
    response,
    timestamp: Date.now(),
  };
  (record as KrakenRecentTradesRecord).id = await storage.recentTrades.appendRecord({
    subIndex: normalizedSymbol,
    record,
  });
  
  await producers.krakenTradeApi.send(
    normalizedSymbol,
    record as KrakenRecentTradesRecord,
  );

  

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
  const { krakenClient, storage, diagnosticContext } = context;

  return createExternalBridgeFetcherLoop<typeof KrakenApi.GetRecentTradesEndpoint>(context, {
    symbol,
    endpointFn: krakenClient.getRecentTrades,
    buildRequestParams: async () => {
      const normalizedSymbol = normalizeSymbol('kraken', symbol);
      const latestRecord = await storage.recentTrades.readLastRecord(normalizedSymbol);
      const latestRecordLastId = latestRecord ? extractQueryNext(latestRecord.response) : undefined;

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
    onSuccess: async ({ query, response, prevResponse }) => {
      if (query.since === prevResponse?.result.last) {
        diagnosticContext.logger.debug('No new trades', {
          symbol,
          endpoint,
          querySince: query.since,
        });
        await sleep(5000);
        return;
      }

      handleRecentTradesResponse(context, query, response, endpoint, symbol);
    },
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
