import { BinanceApi, BinanceWS } from '@krupton/api-interface';
import {
    EndpointStorageRecord,
    WebSocketStorageRecord,
} from '@krupton/persistent-storage-node';
import {
    createEntityReader,
    mergeGenerators,
    TaggedMessage,
    transformBinanceDiffDepthToUnified,
    transformBinanceOrderBookToUnified,
    UnifiedOrderBook,
} from '@krupton/persistent-storage-node/transformed';
import { TransformerContext } from '../process/transformer/transformerContext';

type GeneraredDiffDepthMessage = TaggedMessage<
  WebSocketStorageRecord<typeof BinanceWS.DiffDepthStream>,
  'diffDepth'
>;
type GeneraredOrderBookMessage = TaggedMessage<
  EndpointStorageRecord<typeof BinanceApi.GetOrderBookEndpoint>,
  'orderBook'
>;

export async function startJoinAndTransformBinanceOrderBookPipeline(
  context: TransformerContext,
  normalizedSymbol: string,
) {
  const start = Date.now();
  const { inputStorage, diagnosticContext, processContext } = context;

  const orderBookStream = createEntityReader(
    inputStorage.binanceOrderBook,
    normalizedSymbol,
    { readBatchSize: 100, startGlobalIndex: 0, isStopped: () => processContext.isShuttingDown() },
  );
  const diffDepthStream = createEntityReader(
    inputStorage.binanceDiffDepth,
    normalizedSymbol,
    { readBatchSize: 100, startGlobalIndex: 0, isStopped: () => processContext.isShuttingDown() },
  );

  let lastOrderBook: GeneraredOrderBookMessage | null = {
    ...(await orderBookStream.next()),
    streamName: 'orderBook',
  };

  const mergedStream = mergeGenerators(
    {
      orderBook: orderBookStream,
      diffDepth: diffDepthStream,
    },
    { isStopped: () => processContext.isShuttingDown() },
  );
  let result = await mergedStream.next();

  const transformed: UnifiedOrderBook[] = [];

  while (!result.done) {
    const messages = result.value;

    if (messages.length === 0) {
      diagnosticContext.logger.info('No messages received, waiting...');
      // No messages yet, continue waiting
      result = await mergedStream.next({
        done: [],
        takeMore: ['orderBook', 'diffDepth'],
      });
      continue;
    }

    const done: (GeneraredOrderBookMessage | GeneraredDiffDepthMessage)[] = [];

    for (const message of messages) {
      if (message.streamName === 'orderBook' && !lastOrderBook) {
        lastOrderBook = message;
        continue;
      } else if (message.streamName === 'diffDepth') {
        if (!lastOrderBook) {
          done.push(message);
        } else {
          const diffDepthRecord = message.value;

          if (diffDepthRecord) {
            const U = diffDepthRecord.message.data.U;

            if (U < lastOrderBook.value.response.lastUpdateId) {
              done.push(message);
            } else {
              done.push(lastOrderBook);
              done.push(message);

              lastOrderBook = null;
            }
          }
        }
      }
    }

    transformed.push(
      ...done.map((message) => {
        if (message.streamName === 'orderBook') {
          return transformBinanceOrderBookToUnified(message.value);
        } else if (message.streamName === 'diffDepth') {
          return transformBinanceDiffDepthToUnified(message.value);
        }
        throw new Error('Invalid message stream name');
      }),
    );

    result = await mergedStream.next({
      done: done,
      takeMore: ['diffDepth', 'orderBook'],
    });
  }
  console.log(
    'transformed',
    transformed.map((t) => `${t.type} ${t.timestamp}`).filter((t) => t.includes('snapshot')),
  );
  console.log('total transformed', transformed.length);

  diagnosticContext.logger.info(`Entity readers completed in ${Date.now() - start}ms`);
}
