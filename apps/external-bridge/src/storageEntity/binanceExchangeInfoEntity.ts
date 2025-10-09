import { BinanceApi } from '@krupton/api-interface';
import { createHash } from 'node:crypto';
import type { EndpointEntity } from '../lib/endpointStorage/endpointEntity.js';
import type { EndpointStorage, StorageRecord } from '../lib/endpointStorage/endpointStorage.js';
import { createEndpointStorage } from '../lib/endpointStorage/endpointStorage.js';

export type BinanceExchangeInfoStorage = EndpointStorage<typeof BinanceApi.GetExchangeInfoEndpoint>;
export type BinanceExchangeInfoEntity = ReturnType<typeof createBinanceExchangeInfoEntity>;

type ExchangeInfoRecord = StorageRecord<
  BinanceApi.GetExchangeInfoResponse,
  BinanceApi.GetExchangeInfoRequest
>;

const SYMBOL_ALL = 'ALL';

function hashSymbols(symbols: string[]): string {
  const sortedSymbols = [...symbols].sort();
  const symbolsString = sortedSymbols.join(',');
  return createHash('sha256').update(symbolsString).digest('hex').slice(0, 12);
}

function extractSymbolsFromResponse(response: BinanceApi.GetExchangeInfoResponse): string[] {
  return response.symbols
    .filter((s) => s.status === 'TRADING')
    .map((s) => s.symbol)
    .sort();
}

function createBinanceExchangeInfoStorage(baseDir: string): BinanceExchangeInfoStorage {
  return createEndpointStorage(baseDir, BinanceApi.GetExchangeInfoEndpoint);
}

export function createBinanceExchangeInfoEntity(baseDir: string) {
  const storage = createBinanceExchangeInfoStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: BinanceApi.GetExchangeInfoRequest;
      response: BinanceApi.GetExchangeInfoResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbols = extractSymbolsFromResponse(params.response);
      const currentHash = hashSymbols(symbols);

      const existingLastRecord = await storage.readLastRecord(SYMBOL_ALL);

      if (existingLastRecord) {
        const lastSymbols = extractSymbolsFromResponse(existingLastRecord.response);
        const lastHash = hashSymbols(lastSymbols);

        if (currentHash === lastHash) {
          await storage.replaceLastRecord({
            subIndexDir: SYMBOL_ALL,
            record: {
              timestamp,
              request: params.request,
              response: params.response,
            },
          });

          return;
        }
      }

      await storage.appendRecord({
        subIndexDir: SYMBOL_ALL,
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
      });
    },

    async readLatestRecord(symbol: string = SYMBOL_ALL): Promise<ExchangeInfoRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetExchangeInfoEndpoint>;
}
