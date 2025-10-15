import { BinanceApi } from '@krupton/api-interface';
import {
    createBinanceHistoricalTradeStorage,
    createBinanceTradeWSStorage,
} from '@krupton/persistent-storage-node';
import { createEntityReader } from '@krupton/persistent-storage-node/transformed';
import {
  createMockEnvContext,
  createMockDiagnosticsContext,
  createMockMetricsContext,
  createMockProcessContext,
} from '@krupton/service-framework-node/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBinanceLatestExchangeInfo } from '../lib/symbol/binanceLatestExchangeInfoProvider.js';
import type { BinanceFetcherContext } from '../process/fetcherProcess/binanceFetcherContext.js';
import { createBinanceHistoricalTradesFetcherLoops } from './binanceHistoricalTrades.js';

const debug = (...args: unknown[]) => {
  if (process.env.DEBUG === 'true') {
    console.log(...args);
  }
};

describe('binanceHistoricalTrades - hole detection and filling', () => {
  let tempDir: string;
  let mockContext: BinanceFetcherContext;
  let getHistoricalTradesMock: ReturnType<typeof vi.fn>;
  let apiCallLog: Array<{ fromId: number; limit: number }>;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = mkdtempSync(join(tmpdir(), 'binance-historical-trades-test-'));

    // Initialize exchange info for symbol normalization
    setBinanceLatestExchangeInfo({
      timezone: 'UTC',
      serverTime: Date.now(),
      rateLimits: [],
      symbols: [
        {
          symbol: 'BTCUSDT',
          status: 'TRADING',
          baseAsset: 'BTC',
          baseAssetPrecision: 8,
          quoteAsset: 'USDT',
          quotePrecision: 8,
          quoteAssetPrecision: 8,
          orderTypes: [],
          icebergAllowed: false,
          ocoAllowed: false,
          isSpotTradingAllowed: true,
          isMarginTradingAllowed: false,
          permissions: [],
        },
      ],
    });

    // Track API calls
    apiCallLog = [];

    // Mock getHistoricalTrades to return sequential trade data
    getHistoricalTradesMock = vi
      .fn()
      .mockImplementation(async (params: BinanceApi.GetHistoricalTradesRequest) => {
        const { query } = params;
        const fromId = query.fromId ?? 1;
        const limit = query.limit ?? 500;

        apiCallLog.push({ fromId, limit });

        // Generate sequential trade data from fromId to fromId + limit - 1
        const trades: BinanceApi.GetHistoricalTradesResponse = [];
        for (let i = 0; i < limit; i++) {
          const tradeId = fromId + i;
          trades.push({
            id: tradeId,
            price: '50000.00',
            qty: '0.1',
            quoteQty: '5000.00',
            time: Date.now(),
            isBuyerMaker: false,
            isBestMatch: true,
          });
        }

        // After 3 calls, signal shutdown
        if (apiCallLog.length >= 3) {
          mockContext.processContext.shutdown();
        }

        return trades;
      });

    // Create mock context
    mockContext = {
      envContext: createMockEnvContext({
        PLATFORM: 'binance',
        STORAGE_BASE_DIR: tempDir,
        FETCH_INTERVAL_MS: 0, // No delay between fetches for testing
        LOG_LEVEL: 'error',
      }),
      diagnosticContext: createMockDiagnosticsContext(),
      metricsContext: createMockMetricsContext(),
      processContext: createMockProcessContext(),
      rateLimiter: {
        throttle: vi.fn().mockResolvedValue(undefined),
        recordRequest: vi.fn(),
        onError: vi.fn(),
      },
      binanceClient: {
        getHistoricalTrades: Object.assign(getHistoricalTradesMock, {
          definition: BinanceApi.GetHistoricalTradesEndpoint,
        }),
      },
      storage: {
        historicalTrade: createBinanceHistoricalTradeStorage(tempDir, { writable: true }),
        wsTrade: createBinanceTradeWSStorage(tempDir, { writable: true }),
      },
      producers: {
        binanceTrade: {
          send: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as BinanceFetcherContext;
  });

  afterEach(() => {
    // Cleanup
    mockContext.storage.historicalTrade.close();
    mockContext.storage.wsTrade.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect holes and fill them with correct API calls', { timeout: 15000 }, async () => {
    const symbol = 'BTCUSDT';
    const normalizedSymbol = 'btc_usdt';

    // Populate wsTrade with test data containing holes
    const wsTradeData = [
      { id: 1, tradeId: 300 },
      // hole of size 1002 (from 301 to 1302)
      // requires two fetches with limit 1000 (from 301 limit 1000, from 1301 limit 2)
      { id: 2, tradeId: 1303 },
      // hole of size 1 (1304)
      { id: 4, tradeId: 1305 },
    ];

    for (const data of wsTradeData) {
      await mockContext.storage.wsTrade.appendRecord({
        subIndexDir: normalizedSymbol,
        record: {
          id: data.id,
          timestamp: Date.now(),
          message: {
            stream: `${symbol.toLowerCase()}@trade`,
            data: {
              e: 'trade' as const,
              E: Date.now(),
              s: symbol,
              t: data.tradeId, // Trade ID
              p: '50000.00',
              q: '0.1',
              T: Date.now(),
              m: false,
              M: false,
            },
          },
        },
      });
    }

    // Verify records were written
    const wsTradeCount = await mockContext.storage.wsTrade.count(normalizedSymbol);
    debug('WS Trade records written:', wsTradeCount);

    const wsTradeRecords = await mockContext.storage.wsTrade.readFullPage({
      subIndexDir: normalizedSymbol,
      fileName: 'data',
    });
    debug(
      'WS Trade records:',
      wsTradeRecords.map((r) => ({ id: r.id, tradeId: r.message.data.t })),
    );

    // Test readRecordsRange directly
    const rangeRecords = await mockContext.storage.wsTrade.readRecordsRange({
      subIndexDir: normalizedSymbol,
      fromIndex: 0,
      count: 100,
    });
    debug('readRecordsRange result:', rangeRecords.length, 'records');
    debug(
      'readRecordsRange records:',
      rangeRecords.map((r) => ({ id: r.id, tradeId: r.message.data.t })),
    );

    // Create fetcher loops with modified shutdown logic for testing
    const fetcherLoops = await createBinanceHistoricalTradesFetcherLoops(mockContext, [symbol]);

    expect(fetcherLoops).toHaveLength(1);
    const fetcherLoop = fetcherLoops[0]!;

    // Start the fetcher loop
    await fetcherLoop.start();

    // Wait for the fetcher to complete the fills
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 50; // 50ms
    let elapsed = 0;

    while (apiCallLog.length < 3 && elapsed < maxWaitTime && !mockContext.processContext.isShuttingDown()) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }

    // Stop the fetcher
    void fetcherLoop.stop();

    // Verify API calls
    expect(apiCallLog).toHaveLength(3);
    expect(apiCallLog[0]).toEqual({ fromId: 301, limit: 1000 });
    expect(apiCallLog[1]).toEqual({ fromId: 1301, limit: 2 });
    expect(apiCallLog[2]).toEqual({ fromId: 1304, limit: 1 });

    // Verify that getHistoricalTrades was called with exact params
    expect(getHistoricalTradesMock).toHaveBeenCalledTimes(3);

    // Verify first call
    expect(getHistoricalTradesMock).toHaveBeenNthCalledWith(1, {
      query: { symbol, fromId: 301, limit: 1000 },
    });

    // Verify second call
    expect(getHistoricalTradesMock).toHaveBeenNthCalledWith(2, {
      query: { symbol, fromId: 1301, limit: 2 },
    });

    // Verify third call
    expect(getHistoricalTradesMock).toHaveBeenNthCalledWith(3, {
      query: { symbol, fromId: 1304, limit: 1 },
    });

    // Verify data was stored
    const historicalTradeRecords = await mockContext.storage.historicalTrade.readFullPage({
      subIndexDir: normalizedSymbol,
      fileName: 'data',
    });

    expect(historicalTradeRecords).toHaveLength(3);

    // Collect all trade IDs from both wsTrade and historicalTrade
    const allTradeIds = new Set<number>();

    // Get all wsTrade IDs
    for await (const records of createEntityReader(mockContext.storage.wsTrade, normalizedSymbol, {
      readBatchSize: 100,
      startGlobalIndex: 0,
      isStopped: () => false,
    })) {
      for (const record of records) {
        if (allTradeIds.has(record.message.data.t)) {
          throw new Error(`duplicate trade ID from WS ${record.message.data.t}`);
        }
        allTradeIds.add(record.message.data.t);
      }
    }

    // Get all historicalTrade IDs
    for (const record of historicalTradeRecords) {
      for (const trade of record.response) {
        if (allTradeIds.has(trade.id)) {
          throw new Error(`duplicate trade ID from API ${trade.id}`);
        }
        allTradeIds.add(trade.id);
      }
    }

    // Sort trade IDs
    const sortedTradeIds = Array.from(allTradeIds).sort((a, b) => a - b);

    // Check for duplicates
    const uniqueTradeIds = new Set(sortedTradeIds);
    expect(uniqueTradeIds.size).toBe(sortedTradeIds.length);

    // Check that trades are sequential (no holes)
    const expectedTradeIds: number[] = [];
    for (let i = sortedTradeIds[0]!; i <= sortedTradeIds[sortedTradeIds.length - 1]!; i++) {
      expectedTradeIds.push(i);
    }

    expect(sortedTradeIds).toEqual(expectedTradeIds);

    // Verify specific trade IDs exist
    expect(allTradeIds.has(300)).toBe(true); // First wsTrade
    expect(allTradeIds.has(1303)).toBe(true); // After first hole
    expect(allTradeIds.has(1305)).toBe(true); // After second hole

    // Verify historical trade IDs filled the holes
    expect(allTradeIds.has(301)).toBe(true); // Start of first hole
    expect(allTradeIds.has(1302)).toBe(true); // End of first hole
    expect(allTradeIds.has(1304)).toBe(true); // Second hole
  });
});
