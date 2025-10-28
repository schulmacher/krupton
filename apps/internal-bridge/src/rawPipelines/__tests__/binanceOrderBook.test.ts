import { createMockZmqPublisherRegistry } from '@krupton/messaging-node/test';
import {
  BinanceDiffDepthWSRecord,
  BinanceOrderBookStorageRecord,
} from '@krupton/persistent-storage-node';
import { TaggedMessage, UnifiedOrderBook } from '@krupton/persistent-storage-node/transformed';
import {
  createMockDiagnosticsContext,
  createMockEnvContext,
  createMockMetricsContext,
  createMockProcessContext,
} from '@krupton/service-framework-node/test';
import { sleep } from '@krupton/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BinanceOrdersTransformerContext } from '../../process/transformer/binanceOrders/transformerContext.js';
import * as binanceOrdersMergedModule from '../../streams/rawBinanceOrdersMerged.js';
import { startJoinAndTransformBinanceOrderBookPipeline } from '../binanceOrderBook.js';

const SYMBOL = 'BTCUSDT';

const createSnapshotMessage = ({
  updateId,
  ts,
}: {
  updateId: number;
  ts: number;
}): BinanceOrderBookStorageRecord => ({
  id: updateId,
  timestamp: ts,
  request: {
    query: {
      symbol: SYMBOL,
      limit: 500,
    },
  },
  response: {
    lastUpdateId: updateId,
    asks: [[ts.toString(), updateId.toString()]],
    bids: [[ts.toString(), updateId.toString()]],
  },
});

const createDiffMessage = ({
  startUpdate,
  endUpdate,
  ts,
}: {
  startUpdate: number;
  endUpdate: number;
  ts: number;
}): BinanceDiffDepthWSRecord => ({
  id: endUpdate,
  timestamp: ts,
  message: {
    stream: `${SYMBOL.toLowerCase()}@depth@100ms`,
    data: {
      e: 'depthUpdate' as const,
      E: ts,
      s: SYMBOL,
      U: startUpdate,
      u: endUpdate,
      a: [[ts.toString(), startUpdate.toString()]],
      b: [[ts.toString(), endUpdate.toString()]],
    },
  },
});

describe('startJoinAndTransformBinanceOrderBookPipeline', () => {
  let mockContext: BinanceOrdersTransformerContext;
  let writtenOrderBooks: UnifiedOrderBook[];

  beforeEach(() => {
    writtenOrderBooks = [];

    mockContext = {
      envContext: createMockEnvContext({
        PROCESS_NAME: 'test-transformer',
        NODE_ENV: 'test',
        PORT: 3000,
        EXTERNAL_BRIDGE_STORAGE_BASE_DIR: '/tmp/test',
        INTERNAL_BRIDGE_STORAGE_BASE_DIR: '/tmp/test',
        LOG_LEVEL: 'info',
        SYMBOLS: SYMBOL,
      }),
      diagnosticContext: createMockDiagnosticsContext(),
      metricsContext: createMockMetricsContext(),
      processContext: createMockProcessContext(),
      inputStorage: {
        binanceOrderBook: {} as never,
        binanceDiffDepth: {} as never,
      },
      inputConsumers: {
        binanceOrderBook: {} as never,
        binanceDiffDepth: {} as never,
      },
      outputStorage: {
        unifiedOrderBook: {
          appendRecords: vi.fn(async ({ records }: { records: UnifiedOrderBook[] }) => {
            writtenOrderBooks.push(...records.map((r) => ({ ...r })));
          }),
          readLastRecord: vi.fn(async () => null),
          getNextId: vi.fn(() => Promise.resolve(writtenOrderBooks.length + 1)),
        } as never,
      },
      producers: {
        unifiedOrderBook: createMockZmqPublisherRegistry(),
      },
      transformerState: {
        binanceOrderBook: {
          readLastRecord: vi.fn(async () => null),
          replaceOrInsertLastRecord: vi.fn(async () => {}),
        } as never,
        binanceDiffDepth: {
          readLastRecord: vi.fn(async () => null),
          replaceOrInsertLastRecord: vi.fn(async () => {}),
        } as never,
      },
      symbols: [SYMBOL],
    };
  });

  /**
   * https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams#diff-depth-stream
    Buffer the events received from the stream. Note the U of the first event you received.
    Get a depth snapshot from https://api.binance.com/api/v3/depth?symbol=BNBBTC&limit=5000.
    If the lastUpdateId from the snapshot is strictly less than the U from step 2, go back to step 3.
    In the buffered events, discard any event where u is <= lastUpdateId of the snapshot. The first buffered event should now have lastUpdateId within its [U;u] range.
    Set your local order book to the snapshot. Its update ID is lastUpdateId.
    Apply the update procedure below to all buffered events, and then to all subsequent events received.

    If the event u (last update ID) is < the update ID of your local order book, ignore the event.
    If the event U (first update ID) is > the update ID of your local order book, something went wrong. Discard your local order book and restart the process from the beginning.
    For each price level in bids (b) and asks (a), set the new quantity in the order book:
    If the price level does not exist in the order book, insert it with new quantity.
    If the quantity is zero, remove the price level from the order book.
    Set the order book update ID to the last update ID (u) in the processed event.
   */
  it('should process order books according to the specified scenario', async () => {
    const messageBatches: (
      | TaggedMessage<BinanceOrderBookStorageRecord, 'snapshot'>
      | TaggedMessage<BinanceDiffDepthWSRecord, 'diff'>
    )[][] = [
      // Batch 1: Initial WebSocket diffDepth events that get buffered
      // These arrive before we have the snapshot
      [
        {
          // ignored because startUpdate is less than snapshot updateId + 1
          streamName: 'diff',
          value: createDiffMessage({ startUpdate: 2491733697, endUpdate: 2491733738, ts: 21_00 }),
        },
        {
          streamName: 'diff',
          value: createDiffMessage({ startUpdate: 2491733739, endUpdate: 2491733797, ts: 21_01 }),
        },
        {
          streamName: 'diff',
          value: createDiffMessage({ startUpdate: 2491733798, endUpdate: 2491733930, ts: 21_01 }),
        },
      ],
      // Batch 2: OrderBook snapshot arrives from REST API
      [
        {
          streamName: 'snapshot',
          value: createSnapshotMessage({ updateId: 2491733879, ts: 21_02 }),
        },
      ],
      // Batch 3: DIff after snapshot
      [
        {
          streamName: 'diff',
          value: createDiffMessage({ startUpdate: 2491733931, endUpdate: 2491733958, ts: 21_04 }),
        },
        {
          streamName: 'diff',
          value: createDiffMessage({ startUpdate: 2491733959, endUpdate: 2491734090, ts: 21_05 }),
        },
      ],
      // Batch 4: WebSockets down, diffs from endUpdate + 10, should be ignored until snapshot is received
      [
        {
          streamName: 'diff',
          value: createDiffMessage({ startUpdate: 2491734200, endUpdate: 2491734202, ts: 21_06 }),
        },
        {
          streamName: 'snapshot',
          // snapshot too old for the last diff message (-2)
          value: createSnapshotMessage({ updateId: 2491734098, ts: 21_07 }),
        },
      ],
      // Batch 5: Good diff message after snapshot
      [
        {
          streamName: 'diff',
          value: createDiffMessage({ startUpdate: 2491734099, endUpdate: 2491734102, ts: 21_08 }),
        },
      ],
    ];

    let currentBatchIndex = 0;

    let mockMergedStreamCache: unknown[] = [];

    const mockMergedStream = {
      async next({ done }: { done: unknown[] } = { done: [] }) {
        mockMergedStreamCache = done.length
          ? mockMergedStreamCache.filter((m) => !done.includes(m))
          : mockMergedStreamCache;
        mockMergedStreamCache.push(...(messageBatches[currentBatchIndex] ?? []));
        currentBatchIndex++;

        if (mockContext.processContext.isShuttingDown()) {
          return { done: true, value: [] as never };
        }

        if (currentBatchIndex >= messageBatches.length) {
          mockContext.processContext.shutdown();
        }

        return { done: false, value: mockMergedStreamCache };
      },
    };

    const mockGetBinanceOrdersMergedStream = vi
      .spyOn(binanceOrdersMergedModule, 'getRawBinanceOrdersMergedStream')
      .mockResolvedValue(mockMergedStream as never);

    vi.spyOn(
      binanceOrdersMergedModule,
      'getRawBinanceLatestProcessedOrderBookId',
    ).mockResolvedValue(-1);

    await Promise.race([
      startJoinAndTransformBinanceOrderBookPipeline(mockContext, SYMBOL),
      sleep(10000).then(() => mockContext.processContext.shutdown()),
    ]);

    expect(mockContext.processContext.restart).toHaveBeenCalled();

    const expectedUnifiedOrderBook: Partial<UnifiedOrderBook>[] = [
      {
        type: 'snapshot',
        symbol: SYMBOL,
        asks: [['2102', '2491733879']],
        bids: [['2102', '2491733879']],
        time: 21_02,
        platform: 'binance',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        asks: [['2101', '2491733798']],
        bids: [['2101', '2491733930']],
        time: 21_01,
        platform: 'binance',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        asks: [['2104', '2491733931']],
        bids: [['2104', '2491733958']],
        time: 21_04,
        platform: 'binance',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        asks: [['2105', '2491733959']],
        bids: [['2105', '2491734090']],
        time: 21_05,
        platform: 'binance',
      },
      {
        type: 'snapshot',
        symbol: SYMBOL,
        asks: [['2107', '2491734098']],
        bids: [['2107', '2491734098']],
        time: 21_07,
        platform: 'binance',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        asks: [['2108', '2491734099']],
        bids: [['2108', '2491734102']],
        time: 21_08,
        platform: 'binance',
      },
    ];

    expect(writtenOrderBooks).toEqual(
      expectedUnifiedOrderBook.map((u) => expect.objectContaining(u)),
    );

    // exect the future ws event to still be buffered
    expect(mockMergedStreamCache).toEqual([
      expect.objectContaining({
        streamName: 'diff',
        value: expect.objectContaining({
          timestamp: 21_06,
          message: expect.objectContaining({
            data: expect.objectContaining({
              U: 2491734200,
              u: 2491734202,
            }),
          }),
        }),
      }),
    ]);

    expect(mockGetBinanceOrdersMergedStream).toHaveBeenCalledWith(mockContext, SYMBOL);

    // expect(mockContext.producers.unifiedOrderBook.send).toHaveBeenCalledTimes(
    //   expectedUnifiedOrderBook.length,
    // );
    // for (let i = 0; i < expectedUnifiedOrderBook.length; i++) {
    //   const unifiedOrderBook = expectedUnifiedOrderBook[i];
    //   expect(mockContext.producers.unifiedOrderBook.send).toHaveBeenNthCalledWith(
    //     i + 1,
    //     SYMBOL,
    //     expect.objectContaining({
    //       ...unifiedOrderBook,
    //     }),
    //   );
    // }
  });
});
