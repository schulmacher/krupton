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
import { notNil } from '@krupton/utils';
import { createGenericCheckpointFunction } from '../lib/checkpoint.js';
import { BinanceTradesTransformerContext } from '../process/transformer/binanceTrades/transformerContext.js';
import { getRawBinanceTradesMergedStream } from '../streams/rawBinanceTradesMerged.js';

type GeneratedWSTradeMessage = TaggedMessage<
  WebSocketStorageRecord<typeof BinanceWS.TradeStream>,
  'wsTrade'
>;
type GeneratedAPITradeMessage = TaggedMessage<
  EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>,
  'apiTrade'
>;
type LastEmittedRef = {
  platformTradeId: number;
  apiTradeIndex: number;
  apiTradeIndexTimestamp: number;
  wsTradeIndex: number;
  wsTradeIndexTimestamp: number;
};

function createCheckpointFunction(
  context: BinanceTradesTransformerContext,
  normalizedSymbol: string,
  lastEmmittedRef: LastEmittedRef,
) {
  const { diagnosticContext, processContext, outputStorage, transformerState } = context;
  const { cache, checkpoint } = createGenericCheckpointFunction<UnifiedTrade>({
    diagnosticContext: diagnosticContext,
    processContext: processContext,

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
          type: 'trade',
        },
        allRecords.length,
      );

      if (lastEmmittedRef.apiTradeIndex) {
        await transformerState.binanceHistoricalTrades.replaceOrInsertLastRecord({
          subIndex: normalizedSymbol,
          record: {
            lastProcessedId: lastEmmittedRef.apiTradeIndex,
            timestamp: lastEmmittedRef.apiTradeIndexTimestamp,
            lastProcessedTimestamp: lastEmmittedRef.apiTradeIndexTimestamp,
          },
        });
      }

      if (lastEmmittedRef.wsTradeIndex) {
        await transformerState.binanceWSTrades.replaceOrInsertLastRecord({
          subIndex: normalizedSymbol,
          record: {
            lastProcessedId: lastEmmittedRef.wsTradeIndex,
            timestamp: lastEmmittedRef.wsTradeIndexTimestamp,
            lastProcessedTimestamp: lastEmmittedRef.wsTradeIndexTimestamp,
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

export async function startJoinAndTransformBinanceTradesPipeline(
  context: BinanceTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { outputStorage, diagnosticContext, processContext } = context;
  const mergedStream = await getRawBinanceTradesMergedStream(context, normalizedSymbol);

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

  let failCount = 0;

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
        failCount = 0;
        await emitTrade(trade);
        takeMore.add(trade.streamName);
        continue;
      }

      const nextOfSameType = seekNextOfType(candidateTrades, trade.streamName, i);

      const compareType = trade.streamName === 'apiTrade' ? 'wsTrade' : 'apiTrade';
      const nextOfDifferentType = seekNextOfType(candidateTrades, compareType, i);

      // [2-lastId, 4-ws, 7-api, 8-ws, 9-api] - 4-ws to 7-api confirmed as a hole
      if (nextOfSameType && nextOfDifferentType) {
        failCount = 0;
        await emitTrade(trade);
        takeMore.add(trade.streamName);
        continue;
      } else {
        if (!nextOfSameType) {
          if (failCount === 50) {
            diagnosticContext.logger.info('No next of same type!', {
              lastTradeId: lastEmmittedRef.platformTradeId,
              currentTradeId: trade.trade.platformTradeId,
              gapSize: trade.trade.platformTradeId - lastEmmittedRef.platformTradeId,
              streamName: trade.streamName,
              compareType,
            });
          }
          takeMore.add(trade.streamName);
        }
        if (!nextOfDifferentType) {
          if (failCount === 50) {
            diagnosticContext.logger.info('No next of different type!', {
              lastTradeId: lastEmmittedRef.platformTradeId,
              currentTradeId: trade.trade.platformTradeId,
              gapSize: trade.trade.platformTradeId - lastEmmittedRef.platformTradeId,
              streamName: trade.streamName,
              compareType,
            });
          }
          takeMore.add(compareType);

          failCount = failCount + 1;
          if (failCount > 100) {
            processContext.restart();
          }
        }

        break;
      }
    }

    await checkpoint();

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
