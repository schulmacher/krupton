import { BinanceApi } from '@krupton/api-interface';
import { join } from 'node:path';
import {
  createEndpointStorage,
  EndpointStorage,
  EndpointStorageRecord,
} from '../endpointStorage.js';

export type BinanceExchangeInfoStorage = EndpointStorage<typeof BinanceApi.GetExchangeInfoEndpoint>;
export type BinanceExchangeInfoRecord = EndpointStorageRecord<
  typeof BinanceApi.GetExchangeInfoEndpoint
>;

export function createBinanceExchangeInfoStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinanceExchangeInfoStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createEndpointStorage(baseDir, BinanceApi.GetExchangeInfoEndpoint, options);
}

export const SYMBOL_ALL = 'ALL';

export function isSameExchangeInfoResponse(
  response1: BinanceApi.GetExchangeInfoResponse,
  response2: BinanceApi.GetExchangeInfoResponse,
): boolean {
  return JSON.stringify(response1) === JSON.stringify(response2);
}
