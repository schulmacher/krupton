import { join } from 'node:path';
import { BinanceWS } from '@krupton/api-interface';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../websocketStorage.js';

export type BinancePartialDepthWSStorage = WebSocketStorage<
  typeof BinanceWS.PartialBookDepthStream
>;
export type BinancePartialDepthWSRecord = WebSocketStorageRecord<
  typeof BinanceWS.PartialBookDepthStream
>;

export function createBinancePartialDepthWSStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinancePartialDepthWSStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createWebSocketStorage(baseDir, BinanceWS.PartialBookDepthStream, options);
}
