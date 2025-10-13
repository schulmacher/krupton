import { join } from 'node:path';
import { KrakenWS } from '@krupton/api-interface';
import {
  createWebSocketStorage,
  WebSocketStorage,
} from '../websocketStorage.js';

export type KrakenBookWSStorage = WebSocketStorage<typeof KrakenWS.BookStream>;

export function createKrakenBookWSStorage(
  storageBaseDir: string,
  options: { writable: boolean },
): KrakenBookWSStorage {
  const baseDir = join(storageBaseDir, 'kraken');
  return createWebSocketStorage(baseDir, KrakenWS.BookStream, options);
}

