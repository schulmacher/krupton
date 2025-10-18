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
import { notNil, sleep } from '@krupton/utils';
import { KrakenTradesTransformerContext } from '../process/transformer/krakenTrades/transformerContext';
import { getRawKrakenTradesMergedStream } from '../streams/rawKrakenTradesMerged';

type GeneratedWSTradeMessage = TaggedMessage<KrakenTradeWSRecord, 'wsTrade'>;
type GeneratedAPITradeMessage = TaggedMessage<KrakenRecentTradesRecord, 'apiTrade'>;
type LastEmittedRef = {
  trades: StorageRecord<UnifiedTrade>[];
  platformTradeId: number;
  apiTradeIndex: number;
  apiTradeIndexTimestamp: number;
  wsTradeIndex: number;
  wsTradeIndexTimestamp: number;
};

// TODO move persistance interval to a separate process because
// it seems to be quite CPU heavy and might block the tranformation process
async function createPersistanceInterval(
  context: KrakenTradesTransformerContext,
  normalizedSymbol: string,
  lastEmmittedRef: LastEmittedRef,
) {
  const { outputStorage, transformerState, diagnosticContext, processContext } = context;
  let running = false;

  const interval = setInterval(async () => {
    if (running) {
      return;
    }

    try {
      running = true;
      while (lastEmmittedRef.trades.length > 0) {
        diagnosticContext.logger.debug(`Syncing trades to storage`, {
          symbol: normalizedSymbol,
          cacheLength: lastEmmittedRef.trades.length,
          firstCacheTradeId: lastEmmittedRef.trades[0]?.id,
        });

        const records = lastEmmittedRef.trades.splice(0, 66);

        await outputStorage.unifiedTrade.appendRecords({
          subIndexDir: normalizedSymbol,
          records,
        });
      }

      if (lastEmmittedRef.apiTradeIndex) {
        transformerState.krakenHistoricalTrades
          .replaceOrInsertLastRecord({
            subIndexDir: normalizedSymbol,
            record: {
              lastProcessedId: lastEmmittedRef.apiTradeIndex,
              lastProcessedTimestamp: lastEmmittedRef.apiTradeIndexTimestamp,
              timestamp: lastEmmittedRef.apiTradeIndexTimestamp,
            },
          })
          .catch((error) => {
            diagnosticContext.logger.error(error, 'Error replacing or inserting last record');
          });
      }
      if (lastEmmittedRef.wsTradeIndex) {
        transformerState.krakenWSTrades
          .replaceOrInsertLastRecord({
            subIndexDir: normalizedSymbol,
            record: {
              lastProcessedId: lastEmmittedRef.wsTradeIndex,
              lastProcessedTimestamp: lastEmmittedRef.wsTradeIndexTimestamp,
              timestamp: lastEmmittedRef.wsTradeIndexTimestamp,
            },
          })
          .catch((error) => {
            diagnosticContext.logger.error(error, 'Error replacing or inserting last record');
          });
      }
    } finally {
      running = false;
    }
  }, 100);

  const clearPersistanceInterval = async () => {
    await sleep(100);
    clearInterval(interval);
  };

  processContext.onShutdown(clearPersistanceInterval);

  return clearPersistanceInterval;
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
  const emitCache: StorageRecord<UnifiedTrade>[] = [];
  const lastEmmittedRef: LastEmittedRef = {
    trades: emitCache,
    platformTradeId: lastUnifiedTrade?.platformTradeId ?? 0,
    apiTradeIndex: 0,
    apiTradeIndexTimestamp: 0,
    wsTradeIndex: 0,
    wsTradeIndexTimestamp: 0,
  };

  const clearPersistanceInterval = await createPersistanceInterval(
    context,
    normalizedSymbol,
    lastEmmittedRef,
  );

  async function emitTrade({ trade }: { trade: UnifiedTrade; streamName: 'apiTrade' | 'wsTrade' }) {
    const record: StorageRecord<UnifiedTrade> = {
      id: outputStorage.unifiedTrade.getNextId(normalizedSymbol),
      timestamp: Date.now(),
      ...trade,
    };
    emitCache.push(record);
    lastEmmittedRef.platformTradeId = trade.platformTradeId;
    await context.producers.unifiedTrade
      .send(normalizedSymbol, record)
      .catch((error) => {
        diagnosticContext.logger.error(error, 'Error sending trade to producer');
      })
      .then(() => {
        diagnosticContext.logger.debug('Trade sent to producer', { normalizedSymbol, ...record });
      });
  }

  while (!result.done) {
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

    result = await mergedStream.next({
      // processed are handled in the start of iteration
      done: [],
      takeMore: Array.from(takeMore.values()),
    });
  }

  diagnosticContext.logger.info(`Trade pipeline stopped, socket died? Restaring service!`);

  await clearPersistanceInterval();
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
