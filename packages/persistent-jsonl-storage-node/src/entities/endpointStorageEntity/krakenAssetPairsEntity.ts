import { KrakenApi } from '@krupton/api-interface';
import type { EndpointEntity } from '../../endpointEntity.js';
import {
  createEndpointStorage,
  type EndpointStorage,
  type EndpointStorageRecord,
} from '../../endpointStorage.js';

export type KrakenAssetPairsStorage = EndpointStorage<typeof KrakenApi.GetAssetPairsEndpoint>;
export type KrakenAssetPairsEntity = ReturnType<typeof createKrakenAssetPairsEntity>;

type AssetPairsRecord = EndpointStorageRecord<typeof KrakenApi.GetAssetPairsEndpoint>;

function createKrakenAssetPairsStorage(baseDir: string): KrakenAssetPairsStorage {
  return createEndpointStorage(baseDir, KrakenApi.GetAssetPairsEndpoint);
}

export function createKrakenAssetPairsEntity(baseDir: string) {
  const storage = createKrakenAssetPairsStorage(baseDir);

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

