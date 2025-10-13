import { join } from 'node:path';
import { BinanceApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
} from '../endpointStorage.js';

export type BinanceBookTickerStorage = EndpointStorage<typeof BinanceApi.GetBookTickerEndpoint>;

export function createBinanceBookTickerStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinanceBookTickerStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createEndpointStorage(baseDir, BinanceApi.GetBookTickerEndpoint, options);
}

