import { BinanceApi, BinanceWS } from '@krupton/api-interface';
import {
  EndpointStorageRecord,
  WebSocketStorageRecord,
} from '@krupton/persistent-storage-node';
import {
  createEntityReader,
  mergeGenerators,
  TaggedMessage,
  transformBinanceHistoricalTradesToUnified,
  transformBinanceTradeWSToUnified,
  UnifiedTrade,
} from '@krupton/persistent-storage-node/transformed';
import { TransformerContext } from '../process/transformer/transformerContext';

type GeneratedWSTradeMessage = TaggedMessage<
  WebSocketStorageRecord<typeof BinanceWS.TradeStream>,
  'wsTrade'
>;
type GeneratedAPITradeMessage = TaggedMessage<
  EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>,
  'apiTrade'
>;

export async function startJoinAndTransformBinanceTradesPipeline(
  context: TransformerContext,
  normalizedSymbol: string,
) {
  const start = Date.now();
  const { inputStorage, diagnosticContext, processContext } = context;

  const apiTradeStream = createEntityReader(
    inputStorage.binanceHistoricalTrade,
    normalizedSymbol,
    { readBatchSize: 100, startGlobalIndex: 0, isStopped: () => processContext.isShuttingDown() },
  );
  const wsTradeStream = createEntityReader(
    inputStorage.binanceTrade,
    normalizedSymbol,
    { readBatchSize: 100, startGlobalIndex: 0, isStopped: () => processContext.isShuttingDown() },
  );

  const mergedStream = mergeGenerators(
    {
      apiTrade: apiTradeStream,
      wsTrade: wsTradeStream,
    },
    { isStopped: () => processContext.isShuttingDown() },
  );

  let result = await mergedStream.next();

  const transformed: UnifiedTrade[] = [];
  const seenTradeIds = new Set<number>();

  while (!result.done) {
    const messages = result.value;

    if (messages.length === 0) {
      diagnosticContext.logger.info('No messages received, waiting...');
      // No messages yet, continue waiting
      result = await mergedStream.next({
        done: [],
        takeMore: ['apiTrade', 'wsTrade'],
      });
      continue;
    }

    const processedMessages: (GeneratedAPITradeMessage | GeneratedWSTradeMessage)[] = [];

    for (const message of messages) {
      // Transform the message to get trade IDs
      let trades: UnifiedTrade[];
      if (message.streamName === 'apiTrade') {
        trades = transformBinanceHistoricalTradesToUnified(message.value);
      } else {
        trades = transformBinanceTradeWSToUnified(message.value);
      }

      // Check if any trade in this message is new
      const hasNewTrades = trades.some((trade) => !seenTradeIds.has(trade.tradeId));

      if (hasNewTrades) {
        // Add new trades to our output and mark them as seen
        for (const trade of trades) {
          if (!seenTradeIds.has(trade.tradeId)) {
            seenTradeIds.add(trade.tradeId);
            transformed.push(trade);
          }
        }
        processedMessages.push(message);
      } else {
        // All trades in this message were duplicates, mark as done
        processedMessages.push(message);
      }
    }

    // Request more messages from both streams
    result = await mergedStream.next({
      done: processedMessages,
      takeMore: ['apiTrade', 'wsTrade'],
    });
  }

  console.log('total unique trades', transformed.length);
  console.log('total seen trade IDs', seenTradeIds.size);

  diagnosticContext.logger.info(
    `Trade pipeline completed in ${Date.now() - start}ms, processed ${transformed.length} unique trades`,
  );
}

