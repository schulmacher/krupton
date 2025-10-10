import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../../lib/persistentStorage/endpointEntity.js';
import {
  createEndpointStorage,
  type EndpointStorage,
  type EndpointStorageRecord,
} from '../../lib/persistentStorage/endpointStorage.js';
import { normalizeSymbol } from '../../lib/symbol/normalizeSymbol.js';

export type KrakenRecentTradesStorage = EndpointStorage<typeof KrakenApi.GetRecentTradesEndpoint>;
export type KrakenRecentTradesEntity = ReturnType<typeof createKrakenRecentTradesEntity>;

type RecentTradesRecord = EndpointStorageRecord<typeof KrakenApi.GetRecentTradesEndpoint>;

function createKrakenRecentTradesStorage(baseDir: string): KrakenRecentTradesStorage {
  return createEndpointStorage(baseDir, KrakenApi.GetRecentTradesEndpoint);
}

export function createKrakenRecentTradesEntity(baseDir: string) {
  const storage = createKrakenRecentTradesStorage(baseDir);

  return {
    storage,

    async write(params: {
      request: KrakenApi.GetRecentTradesRequest;
      response: KrakenApi.GetRecentTradesResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const requestPair = params.request.query?.pair;

      if (!requestPair) {
        throw new Error('Pair is required in request params');
      }

      const normalizedSymbol = normalizeSymbol('kraken', requestPair);

      await storage.appendRecord({
        subIndexDir: normalizedSymbol,
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
      });
    },

    async readLatestRecord(symbol: string): Promise<RecentTradesRecord | null> {
      return await storage.readLastRecord(normalizeSymbol('kraken', symbol));
    },
  } satisfies EndpointEntity<typeof KrakenApi.GetRecentTradesEndpoint>;
}
