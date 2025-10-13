import { join } from 'node:path';
import { KrakenWS } from '@krupton/api-interface';
import {
  createWebSocketStorage,
  WebSocketStorage,
} from '../websocketStorage.js';

export type KrakenTickerWSStorage = WebSocketStorage<typeof KrakenWS.TickerStream>;

export function createKrakenTickerWSStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): KrakenTickerWSStorage {
  const baseDir = join(storageBaseDir, 'kraken');
  return createWebSocketStorage(baseDir, KrakenWS.TickerStream, options);
}

