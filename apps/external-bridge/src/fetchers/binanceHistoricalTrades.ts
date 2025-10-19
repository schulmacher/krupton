import { BinanceApi } from '@krupton/api-interface';
import {
  BinanceHistoricalTradeRecord,
  BinanceTradeWSRecord,
} from '@krupton/persistent-storage-node';
import { createEntityReader } from '@krupton/persistent-storage-node/transformed';
import { sleep } from '@krupton/utils';
import { createExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/externalBridgeFetcherLoop.js';
import type { ExternalBridgeFetcherLoop } from '../lib/externalBridgeFetcher/types.js';
import { normalizeSymbol } from '../lib/symbol/normalizeSymbol.js';
import type { BinanceFetcherContext } from '../process/fetcherProcess/binanceFetcherContext.js';

const handleHistoricalTradesResponse = async (
  context: BinanceFetcherContext,
  query: BinanceApi.GetHistoricalTradesQuery,
  response: BinanceApi.GetHistoricalTradesResponse,
  endpoint: string,
  symbol: string,
): Promise<void> => {
  const { diagnosticContext, envContext, storage, producers } = context;
  const config = envContext.config;

  if (!response || response.length === 0) {
    diagnosticContext.logger.debug('Empty response', {
      platform: config.PLATFORM,
      symbol,
      endpoint,
    });
    return;
  }

  const normalizedSymbol = normalizeSymbol('binance', symbol);

  const latestStoredRecord = await storage.historicalTrade.readLastRecord(normalizedSymbol);

  if (
    latestStoredRecord &&
    query.fromId &&
    query.fromId <= latestStoredRecord.request.query.fromId!
  ) {
    diagnosticContext.logger.warn('Skipping historic records', {
      platform: config.PLATFORM,
      symbol: normalizedSymbol,
      endpoint,
    });
    return;
  }

  const record = {
    id: storage.historicalTrade.getNextId(normalizedSymbol),
    timestamp: Date.now(),
    request: { query },
    response,
  };

  await Promise.all([
    storage.historicalTrade.appendRecord({
      subIndexDir: normalizedSymbol,
      record,
    }),
    producers.binanceTrade.send(normalizedSymbol, record),
  ]);

  diagnosticContext.logger.debug('Response saved to storage', {
    platform: config.PLATFORM,
    symbol: normalizedSymbol,
    endpoint,
    query,
    recordCount: response.length,
  });
};

type WsTradeHoleRange = {
  gapStart?: BinanceTradeWSRecord;
  gapEnd?: BinanceTradeWSRecord;
  totalRows?: number;
  lastApiRecord?: BinanceHistoricalTradeRecord;
};

async function seekWsTradeHoleRange(
  context: BinanceFetcherContext,
  normalizedSymbol: string,
  prevHole: WsTradeHoleRange | undefined,
): Promise<WsTradeHoleRange> {
  const { storage } = context;
  const lastApiRecord = await storage.historicalTrade.readLastRecord(normalizedSymbol);
  const lastApiId = lastApiRecord?.response?.at(-1)?.id;
  const CHUNK_SIZE = 100;
  const startGlobalIndex = Math.min(
    prevHole?.gapStart?.id ? prevHole.gapStart.id - CHUNK_SIZE : 0,
    0,
  );

  let gapStart: BinanceTradeWSRecord | undefined = prevHole?.gapStart;
  let gapEnd: BinanceTradeWSRecord | undefined = undefined;

  for await (const records of createEntityReader(storage.wsTrade, normalizedSymbol, {
    readBatchSize: CHUNK_SIZE,
    startGlobalIndex,
    isStopped: () => context.processContext.isShuttingDown(),
  })) {
    for (const record of records) {
      const wsTradeId = record.message.data.t;

      if (lastApiId && wsTradeId < lastApiId) {
        gapStart = record;
        continue;
      }

      if (gapStart && wsTradeId - 1 !== gapStart.message.data.t) {
        if (!lastApiId || wsTradeId !== lastApiId + 1) {
          gapEnd = record;
          break;
        }
      }

      gapStart = record;
    }

    if (gapEnd) {
      break;
    }
  }

  if (gapEnd === undefined || gapStart === undefined) {
    return {
      gapStart,
      totalRows: await storage.wsTrade.count(normalizedSymbol),
      lastApiRecord: lastApiRecord ?? undefined,
    };
  }

  return {
    gapStart,
    gapEnd,
    totalRows: await storage.wsTrade.count(normalizedSymbol),
    lastApiRecord: lastApiRecord ?? undefined,
  };
}

const createBinanceHistoricalTradesFetcherLoopForSymbol = async (
  context: BinanceFetcherContext,
  symbol: string,
  endpoint: string,
): Promise<ExternalBridgeFetcherLoop> => {
  const { binanceClient, diagnosticContext } = context;
  const normalizedSymbol = normalizeSymbol('binance', symbol);
  let wsHole: WsTradeHoleRange | undefined = undefined;

  return createExternalBridgeFetcherLoop<typeof BinanceApi.GetHistoricalTradesEndpoint>(context, {
    symbol,
    endpointFn: binanceClient.getHistoricalTrades,
    buildRequestParams: async () => {
      do {
        wsHole = await seekWsTradeHoleRange(context, normalizedSymbol, wsHole);

        if (!wsHole?.gapStart || !wsHole?.gapEnd) {
          diagnosticContext.logger.info('No holes found, sleeping for 10 seconds', {
            symbol: normalizedSymbol,
            totalRows: wsHole?.totalRows,
            gapStart: wsHole?.gapStart,
          });
          await sleep(1e4);
          continue;
        }

        const lastApiTradeId = wsHole.lastApiRecord?.response?.at(-1)?.id;
        const fromId = Math.max(
          lastApiTradeId ? lastApiTradeId + 1 : 0,
          wsHole.gapStart.message.data.t + 1,
        );
        const limit = Math.min(1000, wsHole.gapEnd.message.data.t - fromId);

        context.diagnosticContext.logger.info('Detected gap in ws trades', {
          symbol: normalizedSymbol,
          lastApiId: wsHole.lastApiRecord?.id,
          gapStartId: wsHole.gapStart.id,
          gapEndId: wsHole.gapEnd.id,
          gapSize: wsHole.gapEnd.id - wsHole.gapStart.id,
          lastApiTradeId,
          gapStartTradeId: wsHole.gapStart.message.data.t,
          gapEndTradeId: wsHole.gapEnd.message.data.t,
          fromId,
          limit,
          totalRows: wsHole.totalRows,
        });

        if (limit < 1) {
          continue;
        }

        return {
          query: {
            symbol,
            fromId,
            limit,
          },
        };
      } while (true);
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
