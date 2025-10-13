import { join } from 'node:path';
import { BinanceApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
  EndpointStorageRecord,
} from '../endpointStorage.js';

export type BinanceOrderBookStorage = EndpointStorage<typeof BinanceApi.GetOrderBookEndpoint>;

export function createBinanceOrderBookStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinanceOrderBookStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createEndpointStorage(baseDir, BinanceApi.GetOrderBookEndpoint, options);
}

export type BinanceOrderBookStorageRecord = EndpointStorageRecord<
  typeof BinanceApi.GetOrderBookEndpoint
>;
