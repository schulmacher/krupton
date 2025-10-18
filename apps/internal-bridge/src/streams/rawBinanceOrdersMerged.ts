import { mergeGenerators } from '@krupton/persistent-storage-node/transformed';
import { createConsistentConsumer } from '../lib/consistentConsumer';
import { createSubIndexStorage } from '../lib/subIndexStorage';
import { BinanceOrdersTransformerContext } from '../process/transformer/binanceOrders/transformerContext';

export async function getRawBinanceOrdersMergedStream(
  context: BinanceOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const { inputStorage, transformerState, processContext } = context;

  const lastOrderBookState =
    await transformerState.binanceOrderBook.readLastRecord(normalizedSymbol);
  const lastDiffDepthState =
    await transformerState.binanceDiffDepth.readLastRecord(normalizedSymbol);

  const snapshotStream = createConsistentConsumer({
    storage: createSubIndexStorage(inputStorage.binanceOrderBook, normalizedSymbol),
    zmqSubscriber: context.inputConsumers.binanceOrderBook.getZmqSubscriber(normalizedSymbol),
    lastState: lastOrderBookState,
    batchSize: 10,
    diagnosticContext: context.diagnosticContext.getChildDiagnosticContext({
      stream: 'binance-api-orderbook-snapshot',
    }),
    isStopped: () => processContext.isShuttingDown(),
  });

  const diffStream = createConsistentConsumer({
    storage: createSubIndexStorage(inputStorage.binanceDiffDepth, normalizedSymbol),
    zmqSubscriber: context.inputConsumers.binanceDiffDepth.getZmqSubscriber(normalizedSymbol),
    lastState: lastDiffDepthState,
    batchSize: 100,
    diagnosticContext: context.diagnosticContext.getChildDiagnosticContext({
      stream: 'binance-ws-orderbook-diff',
    }),
    isStopped: () => processContext.isShuttingDown(),
  });

  const mergedStream = mergeGenerators(
    {
      snapshot: snapshotStream,
      diff: diffStream,
    },
    { isStopped: () => processContext.isShuttingDown() },
  );

  return mergedStream;
}

/**
 * Return the max of final update id of diff and the lastUpdateId of snapshot
 */
export async function getRawBinanceLatestProcessedOrderBookId(
  context: BinanceOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const latestProcessedOrderBookSnapshotId = await getRawBiananceLatestProcessedOrderBookSnapshotId(
    context,
    normalizedSymbol,
  );
  const latestProcessedDiffDepthId = await getRawBiananceLatestProcessedDiffDepthId(
    context,
    normalizedSymbol,
  );

  return Math.max(latestProcessedOrderBookSnapshotId ?? -1, latestProcessedDiffDepthId ?? -1);
}

async function getRawBiananceLatestProcessedOrderBookSnapshotId(
  context: BinanceOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const { transformerState } = context;

  const lastOrderBookState =
    await transformerState.binanceOrderBook.readLastRecord(normalizedSymbol);

  if (lastOrderBookState) {
    const lastOrderBookSnapshot = await context.inputStorage.binanceOrderBook.readRecordsRange({
      subIndexDir: normalizedSymbol,
      fromIndex: lastOrderBookState.lastProcessedId,
      count: 1,
    });

    if (lastOrderBookSnapshot[0]) {
      return lastOrderBookSnapshot[0].response.lastUpdateId;
    }
  }

  return null;
}

async function getRawBiananceLatestProcessedDiffDepthId(
  context: BinanceOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const { transformerState } = context;

  const lastDiffDepthState =
    await transformerState.binanceDiffDepth.readLastRecord(normalizedSymbol);

  if (lastDiffDepthState) {
    const lastDiffDepthSnapshot = await context.inputStorage.binanceDiffDepth.readRecordsRange({
      subIndexDir: normalizedSymbol,
      fromIndex: lastDiffDepthState.lastProcessedId,
      count: 1,
    });

    if (lastDiffDepthSnapshot[0]) {
      return lastDiffDepthSnapshot[0].message.data.u;
    }
  }

  return null;
}
