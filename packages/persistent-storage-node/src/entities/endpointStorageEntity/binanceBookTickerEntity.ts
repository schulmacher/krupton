import { BinanceApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../endpointEntity.js';
import { EndpointStorageRecord } from '../endpointStorage.js';
import type { BinanceBookTickerStorage } from './binanceBookTickerStorage.js';

export type BinanceBookTickerEntity = ReturnType<typeof createBinanceBookTickerEntity>;

type BookTickerRecord = EndpointStorageRecord<typeof BinanceApi.GetBookTickerEndpoint>;

function areResponsesEqual(
  response1: BinanceApi.GetBookTickerResponse,
  response2: BinanceApi.GetBookTickerResponse,
): boolean {
  return JSON.stringify(response1) === JSON.stringify(response2);
}

export function createBinanceBookTickerEntity(storage: BinanceBookTickerStorage) {

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

      const existingLastRecord = await storage.readLastRecord(symbol);

      if (existingLastRecord) {
        if (areResponsesEqual(existingLastRecord.response, params.response)) {
          await storage.replaceLastRecord({
            subIndexDir: symbol,
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
        subIndexDir: symbol,
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
      });
    },

    async readLatestRecord(symbol: string): Promise<BookTickerRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetBookTickerEndpoint>;
}
