import { join } from 'node:path';
import { KrakenApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
} from '../endpointStorage.js';

export type KrakenAssetInfoStorage = EndpointStorage<typeof KrakenApi.GetAssetInfoEndpoint>;

export function createKrakenAssetInfoStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): KrakenAssetInfoStorage {
  const baseDir = join(storageBaseDir, 'kraken');
  return createEndpointStorage(baseDir, KrakenApi.GetAssetInfoEndpoint, options);
}

