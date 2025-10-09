import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../../lib/persistentStorage/endpointEntity.js';
import {
  createEndpointStorage,
  EndpointStorage,
  EndpointStorageRecord,
} from '../../lib/persistentStorage/endpointStorage.js';
import { normalizeSymbol } from '../../lib/symbol/normalizeSymbol.js';

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
      const requestPair = params.request.query?.pair;

      if (!requestPair) {
        throw new Error('Pair is required in request params');
      }

      const noramlizedSymbol = normalizeSymbol('kraken', requestPair);

      const existingLastRecord = await storage.readLastRecord(noramlizedSymbol);

      if (existingLastRecord) {
        if (areResponsesIdentical(existingLastRecord.response, params.response)) {
          await storage.replaceLastRecord({
            subIndexDir: noramlizedSymbol,
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
        subIndexDir: noramlizedSymbol,
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
      });
    },

    async readLatestRecord(normalizedSymbol: string): Promise<OrderBookRecord | null> {
      return await storage.readLastRecord(normalizedSymbol);
    },
  } satisfies EndpointEntity<typeof KrakenApi.GetOrderBookEndpoint>;
}

