import { join } from 'node:path';
import { KrakenApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
  EndpointStorageRecord,
} from '../endpointStorage.js';

export type KrakenRecentTradesStorage = EndpointStorage<typeof KrakenApi.GetRecentTradesEndpoint>;
export type KrakenRecentTradesRecord = EndpointStorageRecord<typeof KrakenApi.GetRecentTradesEndpoint>;

export function createKrakenRecentTradesStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): KrakenRecentTradesStorage {
  const baseDir = join(storageBaseDir, 'kraken');
  return createEndpointStorage(baseDir, KrakenApi.GetRecentTradesEndpoint, options);
}

