import { join } from 'node:path';
import { BinanceApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
} from '../endpointStorage.js';

export type BinanceExchangeInfoStorage = EndpointStorage<typeof BinanceApi.GetExchangeInfoEndpoint>;

export function createBinanceExchangeInfoStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinanceExchangeInfoStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createEndpointStorage(baseDir, BinanceApi.GetExchangeInfoEndpoint, options);
}

