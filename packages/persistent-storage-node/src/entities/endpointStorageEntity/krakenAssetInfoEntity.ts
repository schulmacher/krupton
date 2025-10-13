import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../endpointEntity.js';
import { EndpointStorageRecord } from '../endpointStorage.js';
import type { KrakenAssetInfoStorage } from './krakenAssetInfoStorage.js';

export type KrakenAssetInfoEntity = ReturnType<typeof createKrakenAssetInfoEntity>;

type AssetInfoRecord = EndpointStorageRecord<typeof KrakenApi.GetAssetInfoEndpoint>;

export function createKrakenAssetInfoEntity(storage: KrakenAssetInfoStorage) {

  return {
    storage,

    async write(params: {
      request: KrakenApi.GetAssetInfoRequest;
      response: KrakenApi.GetAssetInfoResponse;
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

    async readLatestRecord(): Promise<AssetInfoRecord | null> {
      return await storage.readLastRecord('all');
    },
  } satisfies EndpointEntity<typeof KrakenApi.GetAssetInfoEndpoint>;
}

