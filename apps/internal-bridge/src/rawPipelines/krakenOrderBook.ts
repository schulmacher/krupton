import { KrakenBookWSRecord, StorageRecord } from '@krupton/persistent-storage-node';
import {
  transformKrakenBookWSToUnified,
  UnifiedOrderBook,
} from '@krupton/persistent-storage-node/transformed';
import { sleep } from '@krupton/utils';
import { KrakenOrdersTransformerContext } from '../process/transformer/krakenOrders/transformerContext';
import {
  getRawKrakenOrderBookLastProcessedIndex,
  getRawKrakenOrderBookStream,
} from '../streams/rawKrakenOrderBook';

type EmitCache = {
  orderbook: StorageRecord<UnifiedOrderBook>[];
  wsIndex: number;
  wsTimestamp: number;
};

export async function startTransformKrakenOrderBookPipeline(
  context: KrakenOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const { outputStorage, diagnosticContext, processContext } = context;

  const wsOrderBookStream = await getRawKrakenOrderBookStream(context, normalizedSymbol);

  const emitCache: EmitCache = {
    orderbook: [],
    wsIndex: 0,
    wsTimestamp: 0,
  };
  const clearPersistanceInterval = await createPersistanceInterval(
    context,
    normalizedSymbol,
    emitCache,
  );
  async function emitOrderBook(orderbook: UnifiedOrderBook) {
    const record: StorageRecord<UnifiedOrderBook> = {
      id: outputStorage.unifiedOrderBook.getNextId(normalizedSymbol),
      timestamp: Date.now(),
      ...orderbook,
    };
    emitCache.orderbook.push(record);
    await context.producers.unifiedOrderBook
      .send(normalizedSymbol, record)
      .catch((error) => {
        diagnosticContext.logger.error(error, 'Error sending orderbook to producer');
      })
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
  }

  diagnosticContext.logger.warn(`Kraken orders pipeline stopped, socket died? Restarting šervice!`);

  await clearPersistanceInterval();
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

async function createPersistanceInterval(
  context: KrakenOrdersTransformerContext,
  normalizedSymbol: string,
  emitCache: EmitCache,
) {
  const { outputStorage, transformerState, diagnosticContext, processContext } = context;
  const interval = setInterval(async () => {
    while (emitCache.orderbook.length > 0) {
      diagnosticContext.logger.debug(`Syncing orderbook to storage`, {
        symbol: normalizedSymbol,
        cacheLength: emitCache.orderbook.length,
        firstCacheOrderBookId: emitCache.orderbook[0]?.id,
      });
      const records = emitCache.orderbook.splice(0, 100);

      await outputStorage.unifiedOrderBook.appendRecords({
        subIndexDir: normalizedSymbol,
        records,
      });
    }

    if (emitCache.wsIndex) {
      transformerState.krakenOrderBookWs
        .replaceOrInsertLastRecord({
          subIndexDir: normalizedSymbol,
          record: {
            lastProcessedId: emitCache.wsIndex,
            lastProcessedTimestamp: emitCache.wsTimestamp,
            timestamp: emitCache.wsTimestamp,
          },
        })
        .catch((error) => {
          diagnosticContext.logger.error(error, 'Error replacing or inserting last record');
        });
    }
  }, 100);

  const clearPersistanceInterval = async () => {
    await sleep(100);
    clearInterval(interval);
  };

  processContext.onShutdown(clearPersistanceInterval);

  return clearPersistanceInterval;
}
