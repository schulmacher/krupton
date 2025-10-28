import { mergeGenerators } from '@krupton/persistent-storage-node/transformed';
import { createConsistentConsumer } from '../lib/consistentConsumer.js';
import { createSubIndexStorage } from '../lib/subIndexStorage.js';
import { BinanceTradesTransformerContext } from '../process/transformer/binanceTrades/transformerContext.js';

export async function getRawBinanceTradesMergedStream(
  context: BinanceTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { inputStorage, transformerState, processContext } = context;

  const apiLastState =
    await transformerState.binanceHistoricalTrades.readLastRecord(normalizedSymbol);
  const wsLastState = await transformerState.binanceWSTrades.readLastRecord(normalizedSymbol);

  const apiStream = createConsistentConsumer({
    storage: createSubIndexStorage(inputStorage.binanceHistoricalTrade, normalizedSymbol),
    zmqSubscriber: context.inputConsumers.binanceTradeApi.getZmqSubscriber(normalizedSymbol),
    lastState: apiLastState,
    batchSize: 3,
    diagnosticContext: context.diagnosticContext.getChildDiagnosticContext({
      stream: 'binance-api-trade',
    }),
    isStopped: () => processContext.isShuttingDown(),
    restartProcess: processContext.restart,
  });

  const wsStream = createConsistentConsumer({
    storage: createSubIndexStorage(inputStorage.binanceTrade, normalizedSymbol),
    zmqSubscriber: context.inputConsumers.binanceTradeWs.getZmqSubscriber(normalizedSymbol),
    lastState: wsLastState,
    batchSize: 200,
    diagnosticContext: context.diagnosticContext.getChildDiagnosticContext({
      stream: 'binance-ws-trade',
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
