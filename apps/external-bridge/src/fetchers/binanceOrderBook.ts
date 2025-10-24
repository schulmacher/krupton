import { EndpointFunction } from '@krupton/api-client-node';
import { BinanceApi } from '@krupton/api-interface';
import { ZmqPublisherRegistry } from '@krupton/messaging-node';
import {
  BinanceOrderBookStorage,
  BinanceOrderBookStorageRecord,
} from '@krupton/persistent-storage-node';
import { createTryhardExponentialBackoff, tryHard } from '@krupton/utils';
import { SF } from '@krupton/service-framework-node';
import { normalizeSymbol } from '../lib/symbol/normalizeSymbol';

export async function saveBinanceOrderBookSnapshots(
  diagnosticContext: SF.DiagnosticContext,
  binanceSymbols: string[],
  getOrderBook: EndpointFunction<typeof BinanceApi.GetOrderBookEndpoint>,
  orderBookStorage: BinanceOrderBookStorage,
  producer: ZmqPublisherRegistry<BinanceOrderBookStorageRecord>,
) {
  diagnosticContext.logger.info('Fetching initial order book for binance symbols', {
    symbols: binanceSymbols,
  });
  for (const symbol of binanceSymbols) {
    const normalizedSymbol = normalizeSymbol('binance', symbol);
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

        const record: Omit<BinanceOrderBookStorageRecord, 'id'> = {
          request: { query },
          response,
          timestamp: Date.now(),
        };

        const id = await orderBookStorage.appendRecord({
          subIndex: normalizedSymbol,
          record,
        });
        (record as BinanceOrderBookStorageRecord).id = id;
        await producer.send(normalizedSymbol, record as BinanceOrderBookStorageRecord);
      },
      createTryhardExponentialBackoff({
        onRetryAttempt: (error, attempt) => {
          diagnosticContext.logger.error(
            error,
            `Failed to get order book snapshot, attempt ${attempt}`,
          );
        },
        maxAttempts: 5,
      }),
    );
  }
  diagnosticContext.logger.info('Fetching initial order book for binance symbols... done!', {
    symbols: binanceSymbols,
  });
}
