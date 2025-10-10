import { BinanceApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../../lib/persistentStorage/endpointEntity.js';
import {
  createEndpointStorage,
  EndpointStorage,
  EndpointStorageRecord,
} from '../../lib/persistentStorage/endpointStorage.js';
import { normalizeSymbol } from '../../lib/symbol/normalizeSymbol.js';

export type BinanceBookTickerStorage = EndpointStorage<typeof BinanceApi.GetBookTickerEndpoint>;
export type BinanceBookTickerEntity = ReturnType<typeof createBinanceBookTickerEntity>;

type BookTickerRecord = EndpointStorageRecord<typeof BinanceApi.GetBookTickerEndpoint>;

function areResponsesEqual(
  response1: BinanceApi.GetBookTickerResponse,
  response2: BinanceApi.GetBookTickerResponse,
): boolean {
  return JSON.stringify(response1) === JSON.stringify(response2);
}

function createBinanceBookTickerStorage(baseDir: string): BinanceBookTickerStorage {
  return createEndpointStorage(baseDir, BinanceApi.GetBookTickerEndpoint);
}

export function createBinanceBookTickerEntity(baseDir: string) {
  const storage = createBinanceBookTickerStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: BinanceApi.GetBookTickerRequest;
      response: BinanceApi.GetBookTickerResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.request.query?.symbol;

      if (!symbol) {
        throw new Error('Symbol is required in request params');
      }

      const normalizedSymbol = normalizeSymbol('binance', symbol);
      const existingLastRecord = await storage.readLastRecord(normalizedSymbol);

      if (existingLastRecord) {
        if (areResponsesEqual(existingLastRecord.response, params.response)) {
          await storage.replaceLastRecord({
            subIndexDir: normalizedSymbol,
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
        subIndexDir: normalizedSymbol,
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
      });
    },

    async readLatestRecord(symbol: string): Promise<BookTickerRecord | null> {
      return await storage.readLastRecord(normalizeSymbol('binance', symbol));
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetBookTickerEndpoint>;
}
