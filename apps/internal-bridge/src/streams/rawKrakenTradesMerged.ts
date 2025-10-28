import { mergeGenerators } from '@krupton/persistent-storage-node/transformed';
import { createConsistentConsumer } from '../lib/consistentConsumer.js';
import { createSubIndexStorage } from '../lib/subIndexStorage.js';
import { KrakenTradesTransformerContext } from '../process/transformer/krakenTrades/transformerContext.js';

export async function getRawKrakenTradesMergedStream(
  context: KrakenTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { inputStorage, transformerState, processContext } = context;

  const apiState = await transformerState.krakenHistoricalTrades.readLastRecord(normalizedSymbol);
  const wsState = await transformerState.krakenWSTrades.readLastRecord(normalizedSymbol);

  const apiStream = createConsistentConsumer({
    storage: createSubIndexStorage(inputStorage.krakenApiTrade, normalizedSymbol),
    zmqSubscriber: context.inputConsumers.krakenTradeApi.getZmqSubscriber(normalizedSymbol),
    lastState: apiState,
    batchSize: 3,
    diagnosticContext: context.diagnosticContext.getChildDiagnosticContext({
      stream: 'kraken-api-trade',
    }),
    isStopped: () => processContext.isShuttingDown(),
    restartProcess: processContext.restart,
  });
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

  const mergedStream = mergeGenerators(
    {
      apiTrade: apiStream,
      wsTrade: wsStream,
    },
    { isStopped: () => processContext.isShuttingDown() },
  );

  return mergedStream;
}
