import { join } from 'node:path';
import { KrakenApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
} from '../endpointStorage.js';

export type KrakenAssetPairsStorage = EndpointStorage<typeof KrakenApi.GetAssetPairsEndpoint>;

export function createKrakenAssetPairsStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): KrakenAssetPairsStorage {
  const baseDir = join(storageBaseDir, 'kraken');
  return createEndpointStorage(baseDir, KrakenApi.GetAssetPairsEndpoint, options);
}

