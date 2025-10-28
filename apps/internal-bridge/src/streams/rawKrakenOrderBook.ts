import { createConsistentConsumer } from '../lib/consistentConsumer.js';
import { createSubIndexStorage } from '../lib/subIndexStorage.js';
import { KrakenOrdersTransformerContext } from '../process/transformer/krakenOrders/transformerContext.js';

export async function getRawKrakenOrderBookStream(
  context: KrakenOrdersTransformerContext,
  normalizedSymbol: string,
) {
  const { inputStorage, transformerState, processContext } = context;

  const wsLastState = await transformerState.krakenOrderBookWs.readLastRecord(normalizedSymbol);

  const wsStream = createConsistentConsumer({
    storage: createSubIndexStorage(inputStorage.krakenOrderBookWs, normalizedSymbol),
    zmqSubscriber: context.inputConsumers.krakenOrderBookWs.getZmqSubscriber(normalizedSymbol),
    lastState: wsLastState,
    batchSize: 200,
    diagnosticContext: context.diagnosticContext.getChildDiagnosticContext({
      stream: 'kraken-ws-orderbook',
    }),
    isStopped: () => processContext.isShuttingDown(),
    restartProcess: processContext.restart,
  });

  return wsStream;
}

export async function getRawKrakenOrderBookLastProcessedIndex(
  context: KrakenOrdersTransformerContext,
  normalizedSymbol: string,
) {
  return await context.transformerState.krakenOrderBookWs.readLastRecord(normalizedSymbol);
}
