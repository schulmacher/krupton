import { EndpointFunction } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import {
  BinanceOrderBookStorage
} from '@krupton/persistent-storage-node';
import { createTryhardExponentialBackoff, tryHard } from '@krupton/utils';
import { DiagnosticContext } from '../../../../packages/service-framework-node/dist/sf';

export async function saveBinanceOrderBookSnapshots(
  diagnosticContext: DiagnosticContext,
  binanceSymbols: string[],
  getOrderBook: EndpointFunction<typeof BinanceApi.GetOrderBookEndpoint>,
  orderBookStorage: BinanceOrderBookStorage,
) {
  diagnosticContext.logger.info('Fetching initial order book for binance symbols', {
    symbols: binanceSymbols,
  });
  for (const symbol of binanceSymbols) {
    diagnosticContext.logger.debug('Fetching initial order book for binance symbol', {
      symbol,
    });
    await tryHard(
      async () => {
        const query = {
          limit: 1000,
          symbol,
        };
        const response = await getOrderBook({
          query,
        });

        await orderBookStorage.appendRecord({
          subIndexDir: symbol,
          record: {
            request: { query },
            response,
            timestamp: Date.now(),
            id: orderBookStorage.getNextId(symbol),
          },
        });
      },
      createTryhardExponentialBackoff({
        onRetryAttempt: (error, attempt) => {
          diagnosticContext.logger.error(`Failed to get order book snapshot, attempt ${attempt}`, {
            error: error,
          });
        },
        maxAttempts: 5,
      }),
    );
  }
  diagnosticContext.logger.info('Fetching initial order book for binance symbols... done!', {
    symbols: binanceSymbols,
  });
}
