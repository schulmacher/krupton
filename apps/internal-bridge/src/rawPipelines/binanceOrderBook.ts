import { BinanceApi, BinanceWS } from '@krupton/api-interface';
import {
  EndpointStorageRecord,
  StorageRecord,
  WebSocketStorageRecord,
} from '@krupton/persistent-storage-node';
import {
  TaggedMessage,
  transformBinanceDiffDepthToUnified,
  transformBinanceOrderBookToUnified,
  UnifiedOrderBook,
} from '@krupton/persistent-storage-node/transformed';
import { notNil, yieldToEventLoop } from '@krupton/utils';
import { createGenericCheckpointFunction } from '../lib/checkpoint.js';
import { BinanceOrdersTransformerContext } from '../process/transformer/binanceOrders/transformerContext.js';
import {
  getRawBinanceLatestProcessedOrderBookId,
  getRawBinanceOrdersMergedStream,
} from '../streams/rawBinanceOrdersMerged.js';

type GeneraredDiffDepthMessage = TaggedMessage<
  WebSocketStorageRecord<typeof BinanceWS.DiffDepthStream>,
  'diff'
>;
type GeneraredOrderBookMessage = TaggedMessage<
  EndpointStorageRecord<typeof BinanceApi.GetOrderBookEndpoint>,
  'snapshot'
>;

type EmitCache = {
  apiIndex: number;
  apiTimestamp: number;
  wsIndex: number;
  wsTimestamp: number;
};

export async function startJoinAndTransformBinanceOrderBookPipeline(
  context: BinanceOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const { diagnosticContext, processContext } = context;

  const mergedStream = await getRawBinanceOrdersMergedStream(context, normalizedSymbol);

  let result = await mergedStream.next();

  const emitCache: EmitCache = {
    apiIndex: 0,
    apiTimestamp: 0,
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
  }

  let lastOrderBookId: number = await getRawBinanceLatestProcessedOrderBookId(
    context,
    normalizedSymbol,
  );

  while (!result.done && !processContext.isShuttingDown()) {
    const messages = result.value;

    if (messages.length === 0) {
      diagnosticContext.logger.debug('No messages received, waiting...');
      // No messages yet, continue waiting
      result = await mergedStream.next({
        done: [],
        takeMore: ['snapshot', 'diff'],
      });
      continue;
    }

    sortMessages(messages);

    const processedMessages: (GeneraredOrderBookMessage | GeneraredDiffDepthMessage)[] = [];
    let waitingForSnaphot = false;

    // make sure that there is at least one snapshot in history before processing diff messages
    for (const message of messages) {
      if (message.streamName === 'snapshot') {
        if (message.value.response.lastUpdateId > lastOrderBookId) {
          lastOrderBookId = message.value.response.lastUpdateId;
          await emitOrderBook(transformBinanceOrderBookToUnified(message.value, normalizedSymbol));
        }

        processedMessages.push(message);
      } else if (message.streamName === 'diff' && lastOrderBookId !== -1) {
        const diff = message.value.message.data;

        // next message U (first id) is previous message u (last id) + 1
        if (diff.U <= lastOrderBookId + 1 && diff.u >= lastOrderBookId) {
          lastOrderBookId = diff.u;
          await emitOrderBook(transformBinanceDiffDepthToUnified(message.value, normalizedSymbol));
          processedMessages.push(message);
        } else if (diff.U > lastOrderBookId + 1) {
          waitingForSnaphot = true;
          context.diagnosticContext.logger.info(
            'diff.U > lastOrderBookId + 1.. wait for snapshot',
            {
              diffFirstUpdateId: diff.U,
              lastOrderBookId,
            },
          );
        } else if (diff.u < lastOrderBookId) {
          context.diagnosticContext.logger.debug('diff.u < lastOrderBookId... ignore message', {
            diffLastUpdateId: diff.u,
            lastOrderBookId,
          });
          processedMessages.push(message);
        }
      }
    }

    if (processedMessages.length > 0) {
      updateEmitCacheFromProcessedMessages(emitCache, processedMessages);
    }

    await checkpoint();
    await yieldToEventLoop();

    result = await mergedStream.next({
      done: processedMessages,
      takeMore: [waitingForSnaphot ? null : ('diff' as const), 'snapshot' as const].filter(notNil),
    });
  }

  diagnosticContext.logger.warn(`Trade pipeline stopped, socket died? Restarting šervice!`);

  await checkpoint(true);
  await processContext.restart();
}

function sortMessages(messages: (GeneraredDiffDepthMessage | GeneraredOrderBookMessage)[]) {
  messages.sort((a, b) => {
    // U - firstUpdateId, u - lastUpdateId
    const aCompare =
      a.streamName === 'snapshot' ? a.value.response.lastUpdateId : a.value.message.data.U;
    const bCompare =
      b.streamName === 'snapshot' ? b.value.response.lastUpdateId : b.value.message.data.U;

    const baseDiff = aCompare - bCompare;

    if (baseDiff) {
      return baseDiff;
    }

    // keep orderBook messages first
    if (a.streamName === 'snapshot' && b.streamName === 'diff') {
      return -1;
    }
    if (a.streamName === 'diff' && b.streamName === 'snapshot') {
      return 1;
    }

    if (a.streamName === 'diff' && b.streamName === 'diff') {
      return b.value.message.data.u - a.value.message.data.u;
    }

    return a.value.timestamp - b.value.timestamp;
  });
}

function updateEmitCacheFromProcessedMessages(
  emitCache: EmitCache,
  processedMessages: (GeneraredOrderBookMessage | GeneraredDiffDepthMessage)[],
) {
  const lastApiMessage = processedMessages.reduce(
    (acc, cur) => {
      if (cur.streamName === 'snapshot') {
        if (acc && acc.value.id > cur.value.id) {
          return acc;
        }
        return cur;
      }
      return acc;
    },
    null as GeneraredOrderBookMessage | null,
  );
  const lastWsMessage = processedMessages.reduce(
    (acc, cur) => {
      if (cur.streamName === 'diff') {
        if (acc && acc.value.id > cur.value.id) {
          return acc;
        }
        return cur;
      }
      return acc;
    },
    null as GeneraredDiffDepthMessage | null,
  );

  if (lastApiMessage) {
    emitCache.apiIndex = lastApiMessage.value.id;
    emitCache.apiTimestamp = lastApiMessage.value.timestamp;
  }
  if (lastWsMessage) {
    emitCache.wsIndex = lastWsMessage.value.id;
    emitCache.wsTimestamp = lastWsMessage.value.timestamp;
  }
}

function createCheckpointFunction(
  context: BinanceOrdersTransformerContext,
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
          platform: 'binance',
          type: 'order_book',
        },
        allRecords.length,
      );

      if (emitCache.apiIndex) {
        await transformerState.binanceOrderBook.replaceOrInsertLastRecord({
          subIndex: normalizedSymbol,
          record: {
            lastProcessedId: emitCache.apiIndex,
            lastProcessedTimestamp: emitCache.apiTimestamp,
            timestamp: emitCache.apiTimestamp,
          },
        });
      }

      if (emitCache.wsIndex) {
        await transformerState.binanceDiffDepth.replaceOrInsertLastRecord({
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
