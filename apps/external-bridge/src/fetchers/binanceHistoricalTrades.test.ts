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
        subIndex: normalizedSymbol,
        record: {
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
    const wsTradeCount = await mockContext.storage.wsTrade.readFullPage({ subIndex: normalizedSymbol });
    debug('WS Trade records written:', wsTradeCount.length);

    // Test readRecordsRange directly
    const rangeRecords = await mockContext.storage.wsTrade.readRecordsRange({
      subIndex: normalizedSymbol,
      fromId: 0,
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

    while (
      apiCallLog.length < 3 &&
      elapsed < maxWaitTime &&
      !mockContext.processContext.isShuttingDown()
    ) {
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
      subIndex: normalizedSymbol,
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

  it('should start reading from middle of trade sequence', { timeout: 15000 }, async () => {
    const symbol = 'BTCUSDT';
    const normalizedSymbol = 'btc_usdt';

    // Populate wsTrade starting from trade ID 5000 with holes
    const wsTradeData = [
      { id: 1, tradeId: 5000 },
      // hole from 5001 to 5499 (499 trades)
      { id: 2, tradeId: 5500 },
      { id: 3, tradeId: 5501 },
    ];

    for (const data of wsTradeData) {
      await mockContext.storage.wsTrade.appendRecord({
        subIndex: normalizedSymbol,
        record: {
          timestamp: Date.now(),
          message: {
            stream: `${symbol.toLowerCase()}@trade`,
            data: {
              e: 'trade' as const,
              E: Date.now(),
              s: symbol,
              t: data.tradeId,
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

    const fetcherLoops = await createBinanceHistoricalTradesFetcherLoops(mockContext, [symbol]);
    const fetcherLoop = fetcherLoops[0]!;

    await fetcherLoop.start();

    const maxWaitTime = 10000;
    const checkInterval = 50;
    let elapsed = 0;

    while (
      apiCallLog.length < 1 &&
      elapsed < maxWaitTime &&
      !mockContext.processContext.isShuttingDown()
    ) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }

    void fetcherLoop.stop();

    expect(apiCallLog.length).toBeGreaterThanOrEqual(1);
    expect(apiCallLog[0]).toEqual({ fromId: 5001, limit: 499 });

    const historicalTradeRecords = await mockContext.storage.historicalTrade.readFullPage({
      subIndex: normalizedSymbol,
    });

    expect(historicalTradeRecords.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle hole appearing async during fetching', { timeout: 15000 }, async () => {
    const symbol = 'BTCUSDT';
    const normalizedSymbol = 'btc_usdt';

    // Initial data with first hole
    const initialData = [
      { id: 1, tradeId: 100 },
      // hole from 101 to 199
      { id: 2, tradeId: 200 },
    ];

    for (const data of initialData) {
      await mockContext.storage.wsTrade.appendRecord({
        subIndex: normalizedSymbol,
        record: {
          timestamp: Date.now(),
          message: {
            stream: `${symbol.toLowerCase()}@trade`,
            data: {
              e: 'trade' as const,
              E: Date.now(),
              s: symbol,
              t: data.tradeId,
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

    const fetcherLoops = await createBinanceHistoricalTradesFetcherLoops(mockContext, [symbol]);
    const fetcherLoop = fetcherLoops[0]!;

    await fetcherLoop.start();

    // Wait for first API call
    while (apiCallLog.length < 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Add new hole while fetching
    await mockContext.storage.wsTrade.appendRecord({
      subIndex: normalizedSymbol,
      record: {
        timestamp: Date.now(),
        message: {
          stream: `${symbol.toLowerCase()}@trade`,
          data: {
            e: 'trade' as const,
            E: Date.now(),
            s: symbol,
            t: 300,
            p: '50000.00',
            q: '0.1',
            T: Date.now(),
            m: false,
            M: false,
          },
        },
      },
    });

    // Wait for processing to complete
    const maxWaitTime = 10000;
    let elapsed = 0;

    while (apiCallLog.length < 2 && elapsed < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      elapsed += 50;
    }

    void fetcherLoop.stop();

    expect(apiCallLog.length).toBeGreaterThanOrEqual(2);
    expect(apiCallLog[0]).toEqual({ fromId: 101, limit: 99 });
  });

  it(
    'should handle large gap and resume from middle when restarted',
    { timeout: 20000 },
    async () => {
      const symbol = 'BTCUSDT';
      const normalizedSymbol = 'btc_usdt';

      // Create a large gap requiring multiple batches (3000+ trades)
      const wsTradeData = [
        { id: 1, tradeId: 1000 },
        // Large gap from 1001 to 4500 (3500 trades = 4 batches of 1000)
        { id: 2, tradeId: 4501 },
      ];

      for (const data of wsTradeData) {
        await mockContext.storage.wsTrade.appendRecord({
          subIndex: normalizedSymbol,
          record: {
            timestamp: Date.now(),
            message: {
              stream: `${symbol.toLowerCase()}@trade`,
              data: {
                e: 'trade' as const,
                E: Date.now(),
                s: symbol,
                t: data.tradeId,
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

      // Control flag for first run
      let firstRunCallCount = 0;
      const maxFirstRunCalls = 2;

      // Override the mock to limit first run to 2 calls
      getHistoricalTradesMock.mockImplementation(
        async (params: BinanceApi.GetHistoricalTradesRequest) => {
          const { query } = params;
          const fromId = query.fromId ?? 1;
          const limit = query.limit ?? 500;

          apiCallLog.push({ fromId, limit });
          firstRunCallCount++;

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

          // Trigger shutdown after 2 calls to force restart scenario
          if (firstRunCallCount >= maxFirstRunCalls) {
            mockContext.processContext.shutdown();
          }

          return trades;
        },
      );

      // First run - process partially
      const fetcherLoops1 = await createBinanceHistoricalTradesFetcherLoops(mockContext, [symbol]);
      const fetcherLoop1 = fetcherLoops1[0]!;

      await fetcherLoop1.start();

      // Wait for shutdown to be triggered
      const maxWaitTime = 10000;
      let elapsed = 0;
      while (!mockContext.processContext.isShuttingDown() && elapsed < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        elapsed += 50;
      }

      await fetcherLoop1.stop();

      const firstRunCalls = apiCallLog.length;
      debug('First run API calls:', firstRunCalls, apiCallLog);
      expect(firstRunCalls).toBe(2);
      expect(apiCallLog[0]).toEqual({ fromId: 1001, limit: 1000 });
      expect(apiCallLog[1]).toEqual({ fromId: 2001, limit: 1000 });

      // Verify partial data was stored
      const historicalTradeRecords1 = await mockContext.storage.historicalTrade.readFullPage({
        subIndex: normalizedSymbol,
      });
      debug('First run stored records:', historicalTradeRecords1.length);
      expect(historicalTradeRecords1.length).toBe(2);

      // Reset API call log
      const firstRunApiCalls = [...apiCallLog];
      apiCallLog.length = 0;

      // Reset process context shutdown state for second run
      mockContext.processContext = createMockProcessContext();

      // Create new mock for second run that will shutdown after 2 calls
      let secondRunCallCount = 0;
      getHistoricalTradesMock.mockImplementation(
        async (params: BinanceApi.GetHistoricalTradesRequest) => {
          const { query } = params;
          const fromId = query.fromId ?? 1;
          const limit = query.limit ?? 500;

          apiCallLog.push({ fromId, limit });
          secondRunCallCount++;

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

          // Shutdown after 2 calls in second run
          if (secondRunCallCount >= 2) {
            mockContext.processContext.shutdown();
          }

          return trades;
        },
      );

      // Second run - should resume from where it left off
      const fetcherLoops2 = await createBinanceHistoricalTradesFetcherLoops(mockContext, [symbol]);
      const fetcherLoop2 = fetcherLoops2[0]!;

      await fetcherLoop2.start();

      // Wait for shutdown in second run
      elapsed = 0;
      while (!mockContext.processContext.isShuttingDown() && elapsed < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        elapsed += 50;
      }

      await fetcherLoop2.stop();

      debug('Second run API calls:', apiCallLog);

      // Should resume from where first run left off (not restart from 1001)
      expect(apiCallLog.length).toBe(2);
      expect(apiCallLog[0]).toEqual({ fromId: 3001, limit: 1000 });
      expect(apiCallLog[1]).toEqual({ fromId: 4001, limit: 500 });

      // Verify total data after both runs
      const historicalTradeRecords2 = await mockContext.storage.historicalTrade.readFullPage({
        subIndex: normalizedSymbol,
      });
      debug('Second run stored records:', historicalTradeRecords2.length);
      expect(historicalTradeRecords2.length).toBe(4);

      // Verify continuity - all historical trades should be stored
      const allTradeIds = new Set<number>();

      for (const record of historicalTradeRecords2) {
        for (const trade of record.response) {
          allTradeIds.add(trade.id);
        }
      }

      for await (const records of createEntityReader(mockContext.storage.wsTrade, normalizedSymbol, {
        readBatchSize: 100,
        startGlobalIndex: 0,
        isStopped: () => false,
      })) {
        for (const record of records) {
          allTradeIds.add(record.message.data.t);
        }
      }

      const sortedTradeIds = Array.from(allTradeIds).sort((a, b) => a - b);
      debug('All trade IDs range:', sortedTradeIds[0], 'to', sortedTradeIds[sortedTradeIds.length - 1]);
      debug('Total unique trade IDs:', sortedTradeIds.length);

      expect(sortedTradeIds[0]).toBe(1000);
      expect(sortedTradeIds[sortedTradeIds.length - 1]).toBe(4501);

      // Verify no duplicates
      expect(sortedTradeIds.length).toBe(allTradeIds.size);

      // Verify complete sequence (no holes)
      for (let i = 1000; i <= 4501; i++) {
        expect(allTradeIds.has(i)).toBe(true);
      }

      // Verify that second run did NOT restart from beginning
      expect(firstRunApiCalls.some((call) => call.fromId === 1001)).toBe(true);
      expect(apiCallLog.some((call) => call.fromId === 1001)).toBe(false);
      expect(apiCallLog.some((call) => call.fromId === 3001)).toBe(true);
    },
  );
});
