import { BinanceApi } from '@krupton/api-interface';
import { createHash } from 'node:crypto';
import type { EndpointEntity } from '../endpointEntity.js';
import { EndpointStorageRecord } from '../endpointStorage.js';
import type { BinanceExchangeInfoStorage } from './binanceExchangeInfoStorage.js';

export type BinanceExchangeInfoEntity = ReturnType<typeof createBinanceExchangeInfoEntity>;

type ExchangeInfoRecord = EndpointStorageRecord<typeof BinanceApi.GetExchangeInfoEndpoint>;

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

/**
 * Filter exchange info response to reduce size and avoid Hypercore 15MB block limit.
 * Keeps only essential trading information for each symbol.
 * Note: This omits the 'permissions' field which can be large.
 */
function filterExchangeInfoResponse(
  response: BinanceApi.GetExchangeInfoResponse,
): BinanceApi.GetExchangeInfoResponse {
  return {
    timezone: response.timezone,
    serverTime: response.serverTime,
    rateLimits: response.rateLimits,
    symbols: response.symbols.map((symbol) => ({
      symbol: symbol.symbol,
      status: symbol.status,
      baseAsset: symbol.baseAsset,
      quoteAsset: symbol.quoteAsset,
      baseAssetPrecision: symbol.baseAssetPrecision,
      quotePrecision: symbol.quotePrecision,
      quoteAssetPrecision: symbol.quoteAssetPrecision,
      orderTypes: symbol.orderTypes,
      icebergAllowed: symbol.icebergAllowed,
      ocoAllowed: symbol.ocoAllowed,
      isSpotTradingAllowed: symbol.isSpotTradingAllowed,
      isMarginTradingAllowed: symbol.isMarginTradingAllowed,
      permissions: symbol.permissions,
    })),
  };
}

export function createBinanceExchangeInfoEntity(storage: BinanceExchangeInfoStorage) {

  return {
    storage,

    async write(params: {
      request: BinanceApi.GetExchangeInfoRequest;
      response: BinanceApi.GetExchangeInfoResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbols = extractSymbolsFromResponse(params.response);
      const currentHash = hashSymbols(symbols);

      // Filter response to reduce size and avoid Hypercore 15MB block limit
      const filteredResponse = filterExchangeInfoResponse(params.response);

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
              response: filteredResponse,
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
          response: filteredResponse,
        },
      });
    },

    async readLatestRecord(): Promise<ExchangeInfoRecord | null> {
      return await storage.readLastRecord(SYMBOL_ALL);
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetExchangeInfoEndpoint>;
}
