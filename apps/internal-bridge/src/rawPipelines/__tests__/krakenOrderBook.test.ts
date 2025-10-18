import { createMockZmqPublisherRegistry } from '@krupton/messaging-node/test';
import { KrakenBookWSRecord } from '@krupton/persistent-storage-node';
import { UnifiedOrderBook } from '@krupton/persistent-storage-node/transformed';
import {
    createMockDiagnosticsContext,
    createMockEnvContext,
    createMockMetricsContext,
    createMockProcessContext,
} from '@krupton/service-framework-node/test';
import { sleep } from '@krupton/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KrakenOrdersTransformerContext } from '../../process/transformer/krakenOrders/transformerContext';
import * as rawKrakenOrderBookModule from '../../streams/rawKrakenOrderBook';
import { startTransformKrakenOrderBookPipeline } from '../krakenOrderBook';

const SYMBOL = 'BTC/USD';

const createKrakenMessage = ({
  id,
  ts,
  type,
  bids,
  asks,
}: {
  id: number;
  ts: number;
  type: 'snapshot' | 'update';
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
}): KrakenBookWSRecord => ({
  id,
  timestamp: ts,
  message: {
    channel: 'book' as const,
    type,
    data: [
      {
        symbol: SYMBOL,
        bids,
        asks,
        checksum: 123456,
        timestamp: type === 'update' ? new Date(ts).toISOString() : undefined,
      },
    ],
  },
});

describe('startTransformKrakenOrderBookPipeline', () => {
  let mockContext: KrakenOrdersTransformerContext;
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
        krakenOrderBookWs: {} as never,
      },
      inputConsumers: {
        krakenOrderBookWs: {} as never,
      },
      outputStorage: {
        unifiedOrderBook: {
          appendRecords: vi.fn(async ({ records }: { records: UnifiedOrderBook[] }) => {
            writtenOrderBooks.push(...records.map((r) => ({ ...r })));
          }),
          readLastRecord: vi.fn(async () => null),
          getNextId: vi.fn(() => writtenOrderBooks.length + 1),
        } as never,
      },
      producers: {
        unifiedOrderBook: createMockZmqPublisherRegistry(),
      },
      transformerState: {
        krakenOrderBookWs: {
          readLastRecord: vi.fn(async () => null),
          replaceOrInsertLastRecord: vi.fn(async () => {}),
        } as never,
      },
      symbols: [SYMBOL],
    };
  });

  it('should process 5 messages with 2 snapshots from scratch', async () => {
    const messages: KrakenBookWSRecord[][] = [
      [
        createKrakenMessage({
          id: 1,
          ts: 1000,
          type: 'snapshot',
          bids: [{ price: 50000, qty: 1.5 }],
          asks: [{ price: 50100, qty: 2.0 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 2,
          ts: 2000,
          type: 'update',
          bids: [{ price: 50010, qty: 1.2 }],
          asks: [{ price: 50090, qty: 1.8 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 3,
          ts: 3000,
          type: 'update',
          bids: [{ price: 50020, qty: 1.0 }],
          asks: [{ price: 50080, qty: 2.2 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 4,
          ts: 4000,
          type: 'snapshot',
          bids: [{ price: 50030, qty: 3.0 }],
          asks: [{ price: 50070, qty: 2.5 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 5,
          ts: 5000,
          type: 'update',
          bids: [{ price: 50040, qty: 1.1 }],
          asks: [{ price: 50060, qty: 1.9 }],
        }),
      ],
    ];

    let currentBatchIndex = 0;

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        while (currentBatchIndex < messages.length) {
          if (mockContext.processContext.isShuttingDown()) {
            break;
          }
          yield messages[currentBatchIndex++];
        }
        mockContext.processContext.shutdown();
      },
    };

    vi.spyOn(rawKrakenOrderBookModule, 'getRawKrakenOrderBookStream').mockResolvedValue(
      mockStream as never,
    );

    vi.spyOn(rawKrakenOrderBookModule, 'getRawKrakenOrderBookLastProcessedIndex').mockResolvedValue(
      null,
    );

    await Promise.race([
      startTransformKrakenOrderBookPipeline(mockContext, SYMBOL),
      sleep(10000).then(() => mockContext.processContext.shutdown()),
    ]);

    expect(mockContext.processContext.restart).toHaveBeenCalled();

    const expectedUnifiedOrderBooks: Partial<UnifiedOrderBook>[] = [
      {
        type: 'snapshot',
        symbol: SYMBOL,
        bids: [['50000', '1.5']],
        asks: [['50100', '2']],
        time: 1000,
        platform: 'kraken',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        bids: [['50010', '1.2']],
        asks: [['50090', '1.8']],
        time: 2000,
        platform: 'kraken',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        bids: [['50020', '1']],
        asks: [['50080', '2.2']],
        time: 3000,
        platform: 'kraken',
      },
      {
        type: 'snapshot',
        symbol: SYMBOL,
        bids: [['50030', '3']],
        asks: [['50070', '2.5']],
        time: 4000,
        platform: 'kraken',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        bids: [['50040', '1.1']],
        asks: [['50060', '1.9']],
        time: 5000,
        platform: 'kraken',
      },
    ];

    expect(writtenOrderBooks).toEqual(
      expectedUnifiedOrderBooks.map((u) => expect.objectContaining(u)),
    );

    expect(mockContext.producers.unifiedOrderBook.send).toHaveBeenCalledTimes(
      expectedUnifiedOrderBooks.length,
    );

    for (let i = 0; i < expectedUnifiedOrderBooks.length; i++) {
      const unifiedOrderBook = expectedUnifiedOrderBooks[i];
      expect(mockContext.producers.unifiedOrderBook.send).toHaveBeenNthCalledWith(
        i + 1,
        SYMBOL,
        expect.objectContaining({
          ...unifiedOrderBook,
        }),
      );
    }
  });

  it('should skip already processed messages when starting from index 3', async () => {
    const messages: KrakenBookWSRecord[][] = [
      [
        createKrakenMessage({
          id: 1,
          ts: 1000,
          type: 'snapshot',
          bids: [{ price: 50000, qty: 1.5 }],
          asks: [{ price: 50100, qty: 2.0 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 2,
          ts: 2000,
          type: 'update',
          bids: [{ price: 50010, qty: 1.2 }],
          asks: [{ price: 50090, qty: 1.8 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 3,
          ts: 3000,
          type: 'update',
          bids: [{ price: 50020, qty: 1.0 }],
          asks: [{ price: 50080, qty: 2.2 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 4,
          ts: 4000,
          type: 'snapshot',
          bids: [{ price: 50030, qty: 3.0 }],
          asks: [{ price: 50070, qty: 2.5 }],
        }),
      ],
      [
        createKrakenMessage({
          id: 5,
          ts: 5000,
          type: 'update',
          bids: [{ price: 50040, qty: 1.1 }],
          asks: [{ price: 50060, qty: 1.9 }],
        }),
      ],
    ];

    let currentBatchIndex = 0;

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        while (currentBatchIndex < messages.length) {
          if (mockContext.processContext.isShuttingDown()) {
            break;
          }
          yield messages[currentBatchIndex++];
        }
        mockContext.processContext.shutdown();
      },
    };

    vi.spyOn(rawKrakenOrderBookModule, 'getRawKrakenOrderBookStream').mockResolvedValue(
      mockStream as never,
    );

    // Start from index 3 - messages 1, 2, 3 should be skipped
    vi.spyOn(rawKrakenOrderBookModule, 'getRawKrakenOrderBookLastProcessedIndex').mockResolvedValue(
      {
        id: 1,
        lastProcessedId: 3,
        lastProcessedTimestamp: 3000,
        timestamp: 3000,
      },
    );

    await Promise.race([
      startTransformKrakenOrderBookPipeline(mockContext, SYMBOL),
      sleep(10000).then(() => mockContext.processContext.shutdown()),
    ]);

    expect(mockContext.processContext.restart).toHaveBeenCalled();

    // Only messages 4 and 5 should be processed (id > 3)
    const expectedUnifiedOrderBooks: Partial<UnifiedOrderBook>[] = [
      {
        type: 'snapshot',
        symbol: SYMBOL,
        bids: [['50030', '3']],
        asks: [['50070', '2.5']],
        time: 4000,
        platform: 'kraken',
      },
      {
        type: 'update',
        symbol: SYMBOL,
        bids: [['50040', '1.1']],
        asks: [['50060', '1.9']],
        time: 5000,
        platform: 'kraken',
      },
    ];

    expect(writtenOrderBooks).toEqual(
      expectedUnifiedOrderBooks.map((u) => expect.objectContaining(u)),
    );

    expect(mockContext.producers.unifiedOrderBook.send).toHaveBeenCalledTimes(
      expectedUnifiedOrderBooks.length,
    );

    for (let i = 0; i < expectedUnifiedOrderBooks.length; i++) {
      const unifiedOrderBook = expectedUnifiedOrderBooks[i];
      expect(mockContext.producers.unifiedOrderBook.send).toHaveBeenNthCalledWith(
        i + 1,
        SYMBOL,
        expect.objectContaining({
          ...unifiedOrderBook,
        }),
      );
    }
  });
});
