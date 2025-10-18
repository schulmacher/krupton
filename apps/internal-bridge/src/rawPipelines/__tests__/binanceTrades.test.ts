import { BinanceApi, BinanceWS } from '@krupton/api-interface';
import { createMockZmqPublisherRegistry } from '@krupton/messaging-node/test';
import { EndpointStorageRecord, WebSocketStorageRecord } from '@krupton/persistent-storage-node';
import { UnifiedTrade } from '@krupton/persistent-storage-node/transformed';
import {
  createMockDiagnosticsContext,
  createMockEnvContext,
  createMockMetricsContext,
  createMockProcessContext,
} from '@krupton/service-framework-node/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BinanceTradesTransformerContext } from '../../process/transformer/binanceTrades/transformerContext';
import * as binanceTradesMergedModule from '../../streams/rawBinanceTradesMerged';
import { startJoinAndTransformBinanceTradesPipeline } from '../binanceTrades';

const SYMBOL = 'BTCUSDT';

const createWSTradeMessage = (
  tradeId: number,
): WebSocketStorageRecord<typeof BinanceWS.TradeStream> => ({
  id: tradeId,
  timestamp: Date.now(),
  message: {
    stream: `${SYMBOL.toLowerCase()}@trade`,
    data: {
      e: 'trade' as const,
      E: Date.now(),
      s: SYMBOL,
      t: tradeId,
      p: '50000.00',
      q: '0.1',
      T: Date.now(),
      m: false,
      M: true,
    },
  },
});

const createAPITradeMessage = (
  tradeId: number,
): EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint> => ({
  id: tradeId,
  timestamp: Date.now(),
  request: {
    query: {
      symbol: SYMBOL,
      limit: 500,
    },
  },
  response: [
    {
      id: tradeId,
      price: '50000.00',
      qty: '0.1',
      quoteQty: '5000.00',
      time: Date.now(),
      isBuyerMaker: false,
      isBestMatch: true,
    },
  ],
});

describe('startJoinAndTransformBinanceTradesPipeline', () => {
  let mockContext: BinanceTradesTransformerContext;
  let writtenTrades: UnifiedTrade[];

  beforeEach(() => {
    writtenTrades = [];

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
        binanceHistoricalTrade: {} as never,
        binanceTrade: {} as never,
      },
      inputConsumers: {
        binanceTradeApi: {} as never,
        binanceTradeWs: {} as never,
      },
      outputStorage: {
        unifiedTrade: {
          appendRecords: vi.fn(async ({ records }: { records: UnifiedTrade[] }) => {
            writtenTrades.push(...records.map((r) => ({ ...r })));
          }),
          readLastRecord: vi.fn(async () => null),
          getNextId: vi.fn(() => writtenTrades.length + 1),
        } as never,
      },
      producers: {
        unifiedTrade: createMockZmqPublisherRegistry(),
      },
      transformerState: {
        binanceHistoricalTrades: {
          readLastRecord: vi.fn(async () => null),
          replaceOrInsertLastRecord: vi.fn(async () => {}),
        } as never,
        binanceWSTrades: {
          readLastRecord: vi.fn(async () => null),
          replaceOrInsertLastRecord: vi.fn(async () => {}),
        } as never,
      },
      symbols: [SYMBOL],
    };
  });

  it('should process trades according to the specified scenario', async () => {
    const messageBatches = [
      [
        { streamName: 'apiTrade' as const, value: createAPITradeMessage(2) },
        { streamName: 'apiTrade' as const, value: createAPITradeMessage(2) },
        { streamName: 'wsTrade' as const, value: createWSTradeMessage(1) },
        { streamName: 'wsTrade' as const, value: createWSTradeMessage(2) },
      ],
      [{ streamName: 'wsTrade' as const, value: createWSTradeMessage(4) }],
      [
        { streamName: 'apiTrade' as const, value: createAPITradeMessage(4) },
        { streamName: 'wsTrade' as const, value: createWSTradeMessage(8) },
        { streamName: 'wsTrade' as const, value: createWSTradeMessage(8) },
      ],
      [{ streamName: 'apiTrade' as const, value: createAPITradeMessage(7) }],
      [
        // does not include sameOfNextType and sameOfCompareType thus all ignored
        { streamName: 'wsTrade' as const, value: createWSTradeMessage(11) },
        { streamName: 'apiTrade' as const, value: createAPITradeMessage(10) },
        { streamName: 'wsTrade' as const, value: createWSTradeMessage(13) },
        { streamName: 'apiTrade' as const, value: createAPITradeMessage(10) },
      ],
      [
        // commit 10 and 11 (confirm 8,9 gap), but 13 still waiting for more messages
        { streamName: 'apiTrade' as const, value: createAPITradeMessage(11) },
      ],
    ];

    let currentBatchIndex = 0;

    let mockMergedStreamCache: unknown[] = [];

    const mockMergedStream = {
      async next({ done }: { done: unknown[] } = { done: [] }) {
        if (
          mockContext.processContext.isShuttingDown() ||
          currentBatchIndex >= messageBatches.length
        ) {
          return { done: true, value: [] as never };
        }
        mockMergedStreamCache = mockMergedStreamCache.filter((m) => !done.includes(m));
        mockMergedStreamCache.push(...messageBatches[currentBatchIndex]);
        currentBatchIndex++;

        return { done: false, value: mockMergedStreamCache };
      },
    };

    const mockGetBinanceTradesMergedStream = vi
      .spyOn(binanceTradesMergedModule, 'getRawBinanceTradesMergedStream')
      .mockResolvedValue(mockMergedStream as never);

    await startJoinAndTransformBinanceTradesPipeline(mockContext, SYMBOL);
    expect(mockContext.processContext.restart).toHaveBeenCalled();
    expect(mockGetBinanceTradesMergedStream).toHaveBeenCalledWith(mockContext, SYMBOL);

    // verify that the trades were written in the correct order
    const tradeIds = writtenTrades.map((t) => t.platformTradeId);
    expect(tradeIds).toEqual([1, 2, 4, 7, 8, 10, 11]);

    // verify messages sent over socket
    expect(mockContext.producers.unifiedTrade.send).toHaveBeenCalledTimes(writtenTrades.length);
    for (let i = 0; i < writtenTrades.length; i++) {
      const trade = writtenTrades[i];
      expect(mockContext.producers.unifiedTrade.send).toHaveBeenNthCalledWith(
        i + 1,
        SYMBOL,
        expect.objectContaining({ ...trade }),
      );
    }
  });
});
