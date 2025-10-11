import { BinanceApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../../endpointEntity.js';
import {
  createEndpointStorage,
  EndpointStorage,
  EndpointStorageRecord,
} from '../../endpointStorage.js';

export type BinanceOrderBookStorage = EndpointStorage<typeof BinanceApi.GetOrderBookEndpoint>;
export type BinanceOrderBookEntity = ReturnType<typeof createBinanceOrderBookEntity>;

type OrderBookRecord = EndpointStorageRecord<typeof BinanceApi.GetOrderBookEndpoint>;

function areResponsesIdentical(
  response1: BinanceApi.GetOrderBookResponse,
  response2: BinanceApi.GetOrderBookResponse,
): boolean {
  return JSON.stringify(response1) === JSON.stringify(response2);
}

function createBinanceOrderBookStorage(baseDir: string): BinanceOrderBookStorage {
  return createEndpointStorage(baseDir, BinanceApi.GetOrderBookEndpoint);
}

export function createBinanceOrderBookEntity(baseDir: string) {
  const storage = createBinanceOrderBookStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: BinanceApi.GetOrderBookRequest;
      response: BinanceApi.GetOrderBookResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.request.query?.symbol;

      if (!symbol) {
        throw new Error('Symbol is required in request params');
      }


      const existingLastRecord = await storage.readLastRecord(symbol);

      if (existingLastRecord) {
        if (areResponsesIdentical(existingLastRecord.response, params.response)) {
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

    async readLatestRecord(symbol: string): Promise<OrderBookRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies EndpointEntity<typeof BinanceApi.GetOrderBookEndpoint>;
}
