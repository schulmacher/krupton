import { BinanceTradeWSRecord, StorageRecord } from '@krupton/persistent-storage-node';
import {
  transformBinanceTradeWSToUnified,
  UnifiedTrade,
} from '@krupton/persistent-storage-node/transformed';
import { yieldToEventLoop } from '@krupton/utils';
import { createGenericCheckpointFunction } from '../lib/checkpoint.js';
import { BinanceTradesTransformerContext } from '../process/transformer/binanceTrades/transformerContext.js';
import { getRawBinanceWSTradesStream } from '../streams/rawBinanceWSTrades.js';

type EmitCache = {
  wsIndex: number;
  wsTimestamp: number;
};

export async function startTransformBinanceTradeWSPipeline(
  context: BinanceTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { diagnosticContext, processContext, transformerState, outputStorage } = context;

  const wsStream = await getRawBinanceWSTradesStream(context, normalizedSymbol);

  const emitCache: EmitCache = {
    wsIndex: 0,
    wsTimestamp: 0,
  };
  const { checkpoint, cache: tradesCache } = createCheckpointFunction(
    context,
    normalizedSymbol,
    emitCache,
  );

  const lastStoredRecord = await outputStorage.unifiedTrade.readLastRecord(normalizedSymbol);
  let localId = (lastStoredRecord?.id ?? 0) + 1;

  async function emit(trade: UnifiedTrade) {
    const record: StorageRecord<UnifiedTrade> = {
      timestamp: Date.now(),
      ...trade,
    };
    tradesCache.push(record);
    void context.producers.unifiedTrade
      .send(`binance-${normalizedSymbol}`, { ...record, id: localId++ })
      .catch((error) => {
        diagnosticContext.logger.error(error, 'Error sending trade to producer');
      });
  }

  const lastUnifiedTrade = await transformerState.binanceWSTrades.readLastRecord(normalizedSymbol);
  let lastProcessedIndex: number = lastUnifiedTrade?.lastProcessedId ?? 0;

  for await (const messages of wsStream) {
    if (messages.length === 0) {
      diagnosticContext.logger.debug('No messages received, waiting...');
      continue;
    }

    for (const message of messages) {
      if (message.id > lastProcessedIndex) {
        await emit(transformBinanceTradeWSToUnified(message, normalizedSymbol));
        lastProcessedIndex = message.id;
      }
    }

    updateEmitCacheFromProcessedMessages(emitCache, messages);

    await yieldToEventLoop();
    await checkpoint();
  }

  diagnosticContext.logger.warn(
    `Binance WS Trades pipeline stopped, socket died? Restarting šervice!`,
  );

  await checkpoint(true);
  await processContext.restart();
}

function updateEmitCacheFromProcessedMessages(
  emitCache: EmitCache,
  messages: BinanceTradeWSRecord[],
) {
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    emitCache.wsIndex = lastMessage.id;
    emitCache.wsTimestamp = lastMessage.timestamp;
  }
}

function createCheckpointFunction(
  context: BinanceTradesTransformerContext,
  normalizedSymbol: string,
  emitCache: EmitCache,
) {
  const { outputStorage, transformerState, diagnosticContext, processContext } = context;
  const { cache, checkpoint } = createGenericCheckpointFunction<StorageRecord<UnifiedTrade>>({
    diagnosticContext,
    processContext,

    async onCheckpoint(allRecords) {
      for (let i = 0; i < allRecords.length; i += 100) {
        const records = allRecords.slice(i, i + 100);

        await outputStorage.unifiedTrade.appendRecords({
          subIndex: normalizedSymbol,
          records,
        });
      }

      void context.metricsContext.metrics.throughput.inc(
        {
          symbol: normalizedSymbol,
          platform: 'binance',
          type: 'trade_ws',
        },
        allRecords.length,
      );

      if (emitCache.wsIndex) {
        await transformerState.binanceWSTrades.replaceOrInsertLastRecord({
          subIndex: normalizedSymbol,
          record: {
            lastProcessedId: emitCache.wsIndex,
            lastProcessedTimestamp: emitCache.wsTimestamp,
            timestamp: emitCache.wsTimestamp,
          },
        });
      }
    },
  });

  return { cache, checkpoint };
}
