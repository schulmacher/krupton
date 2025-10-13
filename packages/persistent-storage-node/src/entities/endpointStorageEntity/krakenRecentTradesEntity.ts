import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../endpointEntity.js';
import { EndpointStorageRecord } from '../endpointStorage.js';
import type { KrakenRecentTradesStorage } from './krakenRecentTradesStorage.js';

export type KrakenRecentTradesEntity = ReturnType<typeof createKrakenRecentTradesEntity>;

type RecentTradesRecord = EndpointStorageRecord<typeof KrakenApi.GetRecentTradesEndpoint>;

export function createKrakenRecentTradesEntity(storage: KrakenRecentTradesStorage) {

  return {
    storage,

    async write(params: {
      request: KrakenApi.GetRecentTradesRequest;
      response: KrakenApi.GetRecentTradesResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const symbol = params.request.query?.pair;

      if (!symbol) {
        throw new Error('Pair is required in request params');
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

    async readLatestRecord(symbol: string): Promise<RecentTradesRecord | null> {
      return await storage.readLastRecord(symbol);
    },
  } satisfies EndpointEntity<typeof KrakenApi.GetRecentTradesEndpoint>;
}
