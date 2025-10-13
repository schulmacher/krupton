import { join } from 'node:path';
import { BinanceApi } from '@krupton/api-interface';
import {
  createEndpointStorage,
  EndpointStorage,
} from '../endpointStorage.js';

export type BinanceHistoricalTradeStorage = EndpointStorage<
  typeof BinanceApi.GetHistoricalTradesEndpoint
>;

export function createBinanceHistoricalTradeStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinanceHistoricalTradeStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createEndpointStorage(baseDir, BinanceApi.GetHistoricalTradesEndpoint, options);
}

