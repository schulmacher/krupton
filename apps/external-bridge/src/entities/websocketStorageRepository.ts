import { join } from 'node:path';
import { createBinanceDiffDepthWSEntity } from './websocketStorageEntity/binanceDiffDepthWSEntity';
import { createBinancePartialDepthWSEntity } from './websocketStorageEntity/binancePartialDepthWSEntity';
import { createBinanceTradeWSEntity } from './websocketStorageEntity/binanceTradeWSEntity';

export function createWebsocketStorageRepository(storageBaseDir: string, platform: string) {
  const baseDir = join(storageBaseDir, platform);

  return {
    binanceTrade: createBinanceTradeWSEntity(baseDir),
    binancePartialDepth: createBinancePartialDepthWSEntity(baseDir),
    binanceDiffDepth: createBinanceDiffDepthWSEntity(baseDir),
  };
}

export type WebSocketStorageRepository = ReturnType<typeof createWebsocketStorageRepository>;
