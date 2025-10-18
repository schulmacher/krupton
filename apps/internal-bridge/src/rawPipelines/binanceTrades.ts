import { BinanceApi, BinanceWS } from '@krupton/api-interface';
import {
  EndpointStorageRecord,
  StorageRecord,
  WebSocketStorageRecord,
} from '@krupton/persistent-storage-node';
import {
  TaggedMessage,
  transformBinanceHistoricalTradeToUnified,
  transformBinanceTradeWSToUnified,
  UnifiedTrade,
} from '@krupton/persistent-storage-node/transformed';
import { notNil, sleep } from '@krupton/utils';
import { BinanceTradesTransformerContext } from '../process/transformer/binanceTrades/transformerContext';
import { getRawBinanceTradesMergedStream } from '../streams/rawBinanceTradesMerged';

type GeneratedWSTradeMessage = TaggedMessage<
  WebSocketStorageRecord<typeof BinanceWS.TradeStream>,
  'wsTrade'
>;
type GeneratedAPITradeMessage = TaggedMessage<
  EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>,
  'apiTrade'
>;
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
  context: BinanceTradesTransformerContext,
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
        transformerState.binanceHistoricalTrades
          .replaceOrInsertLastRecord({
            subIndexDir: normalizedSymbol,
            record: {
              lastProcessedId: lastEmmittedRef.apiTradeIndex,
              timestamp: lastEmmittedRef.apiTradeIndexTimestamp,
              lastProcessedTimestamp: lastEmmittedRef.apiTradeIndexTimestamp,
            },
          })
          .catch((error) => {
            diagnosticContext.logger.error(error, 'Error replacing or inserting last record');
          });
      }
      if (lastEmmittedRef.wsTradeIndex) {
        transformerState.binanceWSTrades
          .replaceOrInsertLastRecord({
            subIndexDir: normalizedSymbol,
            record: {
              lastProcessedId: lastEmmittedRef.wsTradeIndex,
              timestamp: lastEmmittedRef.wsTradeIndexTimestamp,
              lastProcessedTimestamp: lastEmmittedRef.wsTradeIndexTimestamp,
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

export async function startJoinAndTransformBinanceTradesPipeline(
  context: BinanceTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { outputStorage, diagnosticContext, processContext } = context;
  const mergedStream = await getRawBinanceTradesMergedStream(context, normalizedSymbol);

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

    const processedMessages: (GeneratedAPITradeMessage | GeneratedWSTradeMessage)[] =
      filterHistoricMessages(messages, lastEmmittedRef.platformTradeId);

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

    messages.sort((a, b) => {
      const aTradeId =
        a.streamName === 'apiTrade' ? a.value.response[0].id : a.value.message.data.t;
      const bTradeId =
        b.streamName === 'apiTrade' ? b.value.response[0].id : b.value.message.data.t;
      return aTradeId - bTradeId;
    });

    const candidateTrades = messages.reduce(
      (acc, m) => {
        if (processedMessages.includes(m)) {
          return acc;
        }

        if (m.streamName === 'apiTrade') {
          for (const trade of m.value.response) {
            if (acc[acc.length - 1]?.trade.platformTradeId >= trade.id) {
              continue;
            }

            acc.push({
              streamName: m.streamName,
              trade: transformBinanceHistoricalTradeToUnified(trade, m.value.request.query.symbol),
            });
          }
        } else if (m.streamName === 'wsTrade') {
          acc.push({
            streamName: m.streamName,
            trade: transformBinanceTradeWSToUnified(m.value, normalizedSymbol),
          });
        }
        return acc;
      },
      [] as { streamName: 'apiTrade' | 'wsTrade'; trade: UnifiedTrade }[],
    );

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

function filterHistoricMessages(
  messages: (GeneratedAPITradeMessage | GeneratedWSTradeMessage)[],
  lastEmittedTradeID: number,
) {
  return messages.filter((message) => {
    if (message.streamName === 'apiTrade') {
      return message.value.response.every((trade) => trade.id <= lastEmittedTradeID);
    } else if (message.streamName === 'wsTrade') {
      return message.value.message.data.t <= lastEmittedTradeID;
    }
  });
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
