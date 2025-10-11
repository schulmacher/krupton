import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../../endpointEntity.js';
import {
  createEndpointStorage,
  EndpointStorage,
  EndpointStorageRecord,
} from '../../endpointStorage.js';

export type KrakenOrderBookStorage = EndpointStorage<typeof KrakenApi.GetOrderBookEndpoint>;
export type KrakenOrderBookEntity = ReturnType<typeof createKrakenOrderBookEntity>;

type OrderBookRecord = EndpointStorageRecord<typeof KrakenApi.GetOrderBookEndpoint>;

function areResponsesIdentical(
  response1: KrakenApi.GetOrderBookResponse,
  response2: KrakenApi.GetOrderBookResponse,
): boolean {
  return JSON.stringify(response1) === JSON.stringify(response2);
}

function createKrakenOrderBookStorage(baseDir: string): KrakenOrderBookStorage {
  return createEndpointStorage(baseDir, KrakenApi.GetOrderBookEndpoint);
}

export function createKrakenOrderBookEntity(baseDir: string) {
  const storage = createKrakenOrderBookStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: KrakenApi.GetOrderBookRequest;
      response: KrakenApi.GetOrderBookResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.request.query?.pair;

      if (!symbol) {
        throw new Error('Pair is required in request params');
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
  } satisfies EndpointEntity<typeof KrakenApi.GetOrderBookEndpoint>;
}

