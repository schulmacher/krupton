import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../../lib/persistentStorage/endpointEntity.js';
import {
  createEndpointStorage,
  type EndpointStorage,
  type EndpointStorageRecord,
} from '../../lib/persistentStorage/endpointStorage.js';

export type KrakenAssetInfoStorage = EndpointStorage<typeof KrakenApi.GetAssetInfoEndpoint>;
export type KrakenAssetInfoEntity = ReturnType<typeof createKrakenAssetInfoEntity>;

type AssetInfoRecord = EndpointStorageRecord<typeof KrakenApi.GetAssetInfoEndpoint>;

function createKrakenAssetInfoStorage(baseDir: string): KrakenAssetInfoStorage {
  return createEndpointStorage(baseDir, KrakenApi.GetAssetInfoEndpoint);
}

export function createKrakenAssetInfoEntity(baseDir: string) {
  const storage = createKrakenAssetInfoStorage(baseDir);

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

