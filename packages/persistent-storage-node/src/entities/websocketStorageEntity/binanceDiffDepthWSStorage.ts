import { join } from 'node:path';
import { BinanceWS } from '@krupton/api-interface';
import {
  createWebSocketStorage,
  WebSocketStorage,
  WebSocketStorageRecord,
} from '../websocketStorage.js';

export type BinanceDiffDepthWSStorage = WebSocketStorage<typeof BinanceWS.DiffDepthStream>;
export type BinanceDiffDepthWSRecord = WebSocketStorageRecord<typeof BinanceWS.DiffDepthStream>;

export function createBinanceDiffDepthWSStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): BinanceDiffDepthWSStorage {
  const baseDir = join(storageBaseDir, 'binance');
  return createWebSocketStorage(baseDir, BinanceWS.DiffDepthStream, options);
}
