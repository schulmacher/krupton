import { join } from 'node:path';
import { KrakenApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
} from '../endpointStorage.js';

export type KrakenOrderBookStorage = EndpointStorage<typeof KrakenApi.GetOrderBookEndpoint>;

export function createKrakenOrderBookStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): KrakenOrderBookStorage {
  const baseDir = join(storageBaseDir, 'kraken');
  return createEndpointStorage(baseDir, KrakenApi.GetOrderBookEndpoint, options);
}

