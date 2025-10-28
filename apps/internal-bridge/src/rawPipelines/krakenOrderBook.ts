import { KrakenBookWSRecord, StorageRecord } from '@krupton/persistent-storage-node';
import {
  transformKrakenBookWSToUnified,
  UnifiedOrderBook,
} from '@krupton/persistent-storage-node/transformed';
import { yieldToEventLoop } from '@krupton/utils';
import { createGenericCheckpointFunction } from '../lib/checkpoint.js';
import { KrakenOrdersTransformerContext } from '../process/transformer/krakenOrders/transformerContext.js';
import {
  getRawKrakenOrderBookLastProcessedIndex,
  getRawKrakenOrderBookStream,
} from '../streams/rawKrakenOrderBook.js';

type EmitCache = {
  wsIndex: number;
  wsTimestamp: number;
};

export async function startTransformKrakenOrderBookPipeline(
  context: KrakenOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const { diagnosticContext, processContext } = context;

  const wsOrderBookStream = await getRawKrakenOrderBookStream(context, normalizedSymbol);

  const emitCache: EmitCache = {
    wsIndex: 0,
    wsTimestamp: 0,
  };
  const { checkpoint, cache: orderbookCache } = createCheckpointFunction(
    context,
    normalizedSymbol,
    emitCache,
  );
  async function emitOrderBook(orderbook: UnifiedOrderBook) {
    const record: StorageRecord<UnifiedOrderBook> = {
      timestamp: Date.now(),
      ...orderbook,
    };
    orderbookCache.push(record);
    // await context.producers.unifiedOrderBook.send(normalizedSymbol, record).catch((error) => {
    //   diagnosticContext.logger.error(error, 'Error sending orderbook to producer');
    // });
  }

  let lastProcessedIndex: number =
    (await getRawKrakenOrderBookLastProcessedIndex(context, normalizedSymbol))?.lastProcessedId ??
    0;

  for await (const messages of wsOrderBookStream) {
    if (messages.length === 0) {
      diagnosticContext.logger.debug('No messages received, waiting...');
      continue;
    }

    for (const message of messages) {
      if (message.id > lastProcessedIndex) {
        // the message can contain several currencies by kraken design, but we are asking only for one
        // so theoretically there should only be one entry in the array
        for (const orderBook of transformKrakenBookWSToUnified(message, normalizedSymbol)) {
          await emitOrderBook(orderBook);
        }
        lastProcessedIndex = message.id;
      }
    }

    updateEmitCacheFromProcessedMessages(emitCache, messages);
    
    await yieldToEventLoop();
    await checkpoint();
  }

  diagnosticContext.logger.warn(`Kraken orders pipeline stopped, socket died? Restarting šervice!`);

  await checkpoint(true);
  await processContext.restart();
}

function updateEmitCacheFromProcessedMessages(
  emitCache: EmitCache,
  messages: KrakenBookWSRecord[],
) {
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    emitCache.wsIndex = lastMessage.id;
    emitCache.wsTimestamp = lastMessage.timestamp;
  }
}

function createCheckpointFunction(
  context: KrakenOrdersTransformerContext,
  normalizedSymbol: string,
  emitCache: EmitCache,
) {
  const { outputStorage, transformerState, diagnosticContext, processContext } = context;
  const { cache, checkpoint } = createGenericCheckpointFunction<StorageRecord<UnifiedOrderBook>>({
    diagnosticContext,
    processContext,

    async onCheckpoint(allRecords) {
      for (let i = 0; i < allRecords.length; i += 100) {
        const records = allRecords.slice(i, i + 100);

        await outputStorage.unifiedOrderBook.appendRecords({
          subIndex: normalizedSymbol,
          records,
        });
      }

      void context.metricsContext.metrics.throughput.inc(
        {
          symbol: normalizedSymbol,
          platform: 'kraken',
          type: 'order_book',
        },
        allRecords.length,
      );

      if (emitCache.wsIndex) {
        await transformerState.krakenOrderBookWs.replaceOrInsertLastRecord({
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
