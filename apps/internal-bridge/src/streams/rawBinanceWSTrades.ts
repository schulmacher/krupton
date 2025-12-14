import { createConsistentConsumer } from '../lib/consistentConsumer.js';
import { createSubIndexStorage } from '../lib/subIndexStorage.js';
import { BinanceTradesTransformerContext } from '../process/transformer/binanceTrades/transformerContext.js';

export async function getRawBinanceWSTradesStream(
  context: BinanceTradesTransformerContext,
  normalizedSymbol: string,
) {
  const { inputStorage, transformerState, processContext } = context;

  const wsLastState = await transformerState.binanceWSTrades.readLastRecord(normalizedSymbol);

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
  return wsStream;
}
