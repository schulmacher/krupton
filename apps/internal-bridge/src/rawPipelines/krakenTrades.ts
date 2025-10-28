import {
  KrakenRecentTradesRecord,
  KrakenTradeWSRecord,
  StorageRecord,
} from '@krupton/persistent-storage-node';
import {
  TaggedMessage,
  transformKrakenRecentTradeToUnified,
  transformKrakenTradeWSToUnified,
  UnifiedTrade,
} from '@krupton/persistent-storage-node/transformed';
import { notNil, yieldToEventLoop } from '@krupton/utils';
import { createGenericCheckpointFunction } from '../lib/checkpoint.js';
import { KrakenTradesTransformerContext } from '../process/transformer/krakenTrades/transformerContext.js';
import { getRawKrakenTradesMergedStream } from '../streams/rawKrakenTradesMerged.js';

type GeneratedWSTradeMessage = TaggedMessage<KrakenTradeWSRecord, 'wsTrade'>;
type GeneratedAPITradeMessage = TaggedMessage<KrakenRecentTradesRecord, 'apiTrade'>;
type LastEmittedRef = {
  platformTradeId: number;
  apiTradeIndex: number;
  apiTradeIndexTimestamp: number;
  wsTradeIndex: number;
  wsTradeIndexTimestamp: number;
};

function createCheckpointFunction(
  context: KrakenTradesTransformerContext,
  normalizedSymbol: string,
  lastEmmittedRef: LastEmittedRef,
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
          platform: 'kraken',
          type: 'trade',
        },
        allRecords.length,
      );

      if (lastEmmittedRef.apiTradeIndex) {
        await transformerState.krakenHistoricalTrades.replaceOrInsertLastRecord({
          subIndex: normalizedSymbol,
          record: {
            lastProcessedId: lastEmmittedRef.apiTradeIndex,
            lastProcessedTimestamp: lastEmmittedRef.apiTradeIndexTimestamp,
            timestamp: lastEmmittedRef.apiTradeIndexTimestamp,
          },
        });
      }

      if (lastEmmittedRef.wsTradeIndex) {
        await transformerState.krakenWSTrades.replaceOrInsertLastRecord({
          subIndex: normalizedSymbol,
          record: {
            lastProcessedId: lastEmmittedRef.wsTradeIndex,
            lastProcessedTimestamp: lastEmmittedRef.wsTradeIndexTimestamp,
            timestamp: lastEmmittedRef.wsTradeIndexTimestamp,
          },
        });
      }
    },
  });

  return { cache, checkpoint };
}

function updateLastEmmittedRefFromProcessedMessages(
  lastEmmittedRef: LastEmittedRef,
  processedMessages: (GeneratedAPITradeMessage | GeneratedWSTradeMessage)[],
) {
  const lastProcessedApiTradeIndex = processedMessages.reduce(
    (acc, m, i) => {
      if (m.streamName === 'apiTrade') {
        const prev = acc ? processedMessages[acc].value.id : 0;
        const curr = m.value.id;

        if (curr > prev) {
          return i;
        } else {
          return acc;
        }
      }
      return acc;
    },
    null as number | null,
  );

  const lastProcessedWSTradeIndex = processedMessages.reduce(
    (acc, m, i) => {
      if (m.streamName === 'wsTrade') {
        const prev = acc ? processedMessages[acc].value.id : 0;
        const curr = m.value.id;

        if (curr > prev) {
          return i;
        } else {
          return acc;
        }
      }
      return acc;
    },
    null as number | null,
  );

  if (lastProcessedApiTradeIndex !== null) {
    const item = processedMessages[lastProcessedApiTradeIndex];
    lastEmmittedRef.apiTradeIndexTimestamp = item.value.timestamp;
    lastEmmittedRef.apiTradeIndex = item.value.id;
  }

  if (lastProcessedWSTradeIndex !== null) {
    const item = processedMessages[lastProcessedWSTradeIndex];
    lastEmmittedRef.wsTradeIndexTimestamp = item.value.timestamp;
    lastEmmittedRef.wsTradeIndex = item.value.id;
  }
}

export async function startJoinAndTransformKrakenTradesPipeline(
  context: KrakenTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { outputStorage, diagnosticContext, processContext } = context;
  const mergedStream = await getRawKrakenTradesMergedStream(context, normalizedSymbol);

  let result = await mergedStream.next();

  const lastUnifiedTrade = await outputStorage.unifiedTrade.readLastRecord(normalizedSymbol);
  const lastEmmittedRef: LastEmittedRef = {
    platformTradeId: lastUnifiedTrade?.platformTradeId ?? 0,
    apiTradeIndex: 0,
    apiTradeIndexTimestamp: 0,
    wsTradeIndex: 0,
    wsTradeIndexTimestamp: 0,
  };

  const { checkpoint, cache: emitCache } = createCheckpointFunction(
    context,
    normalizedSymbol,
    lastEmmittedRef,
  );

  async function emitTrade({ trade }: { trade: UnifiedTrade; streamName: 'apiTrade' | 'wsTrade' }) {
    const record: StorageRecord<UnifiedTrade> = {
      timestamp: Date.now(),
      ...trade,
    };
    emitCache.push(record);
    lastEmmittedRef.platformTradeId = trade.platformTradeId;
    // await context.producers.unifiedTrade
    //   .send(normalizedSymbol, record)
    //   .catch((error) => {
    //     diagnosticContext.logger.error(error, 'Error sending trade to producer');
    //   })
    //   .then(() => {
    //     diagnosticContext.logger.debug('Trade sent to producer', { normalizedSymbol, ...record });
    //   });
  }

  while (!result.done && !processContext.isShuttingDown()) {
    const messages = result.value;

    if (messages.length === 0) {
      diagnosticContext.logger.debug('No messages received, waiting...');
      // No messages yet, continue waiting
      result = await mergedStream.next({
        done: [],
        takeMore: ['apiTrade', 'wsTrade'],
      });
      continue;
    }

    const processedMessages: (GeneratedAPITradeMessage | GeneratedWSTradeMessage)[] = [];

    const candidateTrades = messages
      .reduce(
        (acc, m) => {
          const unifiedTrades =
            m.streamName === 'apiTrade'
              ? transformKrakenRecentTradeToUnified(m.value, normalizedSymbol)
              : transformKrakenTradeWSToUnified(m.value, normalizedSymbol);

          if (
            unifiedTrades.every((trade) => trade.platformTradeId <= lastEmmittedRef.platformTradeId)
          ) {
            processedMessages.push(m);
            // return acc;
          }

          for (const trade of unifiedTrades) {
            if (acc[acc.length - 1]?.trade.platformTradeId >= trade.platformTradeId) {
              continue;
            }

            acc.push({
              streamName: m.streamName,
              trade,
            });
          }

          return acc;
        },
        [] as { streamName: 'apiTrade' | 'wsTrade'; trade: UnifiedTrade }[],
      )
      .sort((a, b) => a.trade.platformTradeId - b.trade.platformTradeId);

    if (processedMessages.length) {
      result = await mergedStream.next({
        done: processedMessages,
        takeMore: [
          processedMessages.some((m) => m.streamName === 'apiTrade')
            ? ('apiTrade' as const)
            : undefined,
          processedMessages.some((m) => m.streamName === 'wsTrade')
            ? ('wsTrade' as const)
            : undefined,
        ].filter(notNil),
      });

      updateLastEmmittedRefFromProcessedMessages(lastEmmittedRef, processedMessages);

      continue;
    }

    const takeMore: Set<'wsTrade' | 'apiTrade'> = new Set();

    for (let i = 0; i < candidateTrades.length; i++) {
      const trade = candidateTrades[i];

      if (trade.trade.platformTradeId <= lastEmmittedRef.platformTradeId) {
        takeMore.add(trade.streamName);
        continue;
      }

      if (trade.trade.platformTradeId === lastEmmittedRef.platformTradeId + 1) {
        await emitTrade(trade);
        takeMore.add(trade.streamName);
        continue;
      }

      const nextOfSameType = seekNextOfType(candidateTrades, trade.streamName, i);

      const compareType = trade.streamName === 'apiTrade' ? 'wsTrade' : 'apiTrade';
      const nextOfDifferentType = seekNextOfType(candidateTrades, compareType, i);

      // [2-lastId, 4-ws, 7-api, 8-ws, 9-api] - 4-ws to 7-api confirmed as a hole
      if (nextOfSameType && nextOfDifferentType) {
        await emitTrade(trade);
        takeMore.add(trade.streamName);
        continue;
      } else {
        if (!nextOfSameType) {
          takeMore.add(trade.streamName);
        }
        if (!nextOfDifferentType) {
          takeMore.add(compareType);
        }
        break;
      }
    }

    await checkpoint();
    await yieldToEventLoop();

    result = await mergedStream.next({
      // processed are handled in the start of iteration
      done: [],
      takeMore: Array.from(takeMore.values()),
    });
  }

  diagnosticContext.logger.info(`Trade pipeline stopped, socket died? Restaring service!`);

  await checkpoint(true);
  await processContext.restart();
}

function seekNextOfType(
  trades: { trade: UnifiedTrade; streamName: 'wsTrade' | 'apiTrade' }[],
  type: 'apiTrade' | 'wsTrade',
  sinceIndex: number,
) {
  for (let i = sinceIndex; i < trades.length; i++) {
    if (trades[i].streamName === type) {
      return trades[i];
    }
  }
}
