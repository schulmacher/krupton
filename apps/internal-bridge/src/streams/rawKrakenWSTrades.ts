import { mergeGenerators } from '@krupton/persistent-storage-node/transformed';
import { createConsistentConsumer } from '../lib/consistentConsumer.js';
import { createSubIndexStorage } from '../lib/subIndexStorage.js';
import { KrakenTradesTransformerContext } from '../process/transformer/krakenTrades/transformerContext.js';

export async function getRawKrakenWSTradesStream(
  context: KrakenTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { inputStorage, transformerState, processContext } = context;

  const wsState = await transformerState.krakenWSTrades.readLastRecord(normalizedSymbol);
  const wsStream = createConsistentConsumer({
    storage: createSubIndexStorage(inputStorage.krakenWsTrade, normalizedSymbol),
    zmqSubscriber: context.inputConsumers.krakenTradeWs.getZmqSubscriber(normalizedSymbol),
    lastState: wsState,
    batchSize: 200,
    diagnosticContext: context.diagnosticContext.getChildDiagnosticContext({
      stream: 'kraken-ws-trade',
    }),
    isStopped: () => processContext.isShuttingDown(),
    restartProcess: processContext.restart,
  });

  return wsStream;
}
