import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../endpointEntity.js';
import { EndpointStorageRecord } from '../endpointStorage.js';
import type { KrakenAssetPairsStorage } from './krakenAssetPairsStorage.js';

export type KrakenAssetPairsEntity = ReturnType<typeof createKrakenAssetPairsEntity>;

type AssetPairsRecord = EndpointStorageRecord<typeof KrakenApi.GetAssetPairsEndpoint>;

export function createKrakenAssetPairsEntity(storage: KrakenAssetPairsStorage) {

  return {
    storage,

    async write(params: {
      request: KrakenApi.GetAssetPairsRequest;
      response: KrakenApi.GetAssetPairsResponse;
    }): Promise<void> {
      const timestamp = Date.now();
      const subIndexDir = 'all';

      await storage.appendRecord({
        subIndexDir,
        record: {
          timestamp,
          request: params.request,
          response: params.response,
        },
      });
    },

    async readLatestRecord(): Promise<AssetPairsRecord | null> {
      return await storage.readLastRecord('all');
    },
  } satisfies EndpointEntity<typeof KrakenApi.GetAssetPairsEndpoint>;
}

