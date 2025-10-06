import { join } from 'node:path';
import { createBinanceBookTickerEntity } from './storageEntity/binanceBookTickerEntity.js';
import { createBinanceExchangeInfoEntity } from './storageEntity/binanceExchangeInfoEntity.js';
import { createBinanceHistoricalTradeEntity } from './storageEntity/binanceHistoricalTradeEntity.js';
import { createBinanceOrderBookEntity } from './storageEntity/binanceOrderBookEntity.js';

export function createEndpointStorageRepository(storageBaseDir: string, platform: string) {
  const baseDir = join(storageBaseDir, platform);

  return {
    binanceBookTicker: createBinanceBookTickerEntity(baseDir),
    binanceOrderBook: createBinanceOrderBookEntity(baseDir),
    binanceHistoricalTrade: createBinanceHistoricalTradeEntity(baseDir),
    binanceExchangeInfo: createBinanceExchangeInfoEntity(baseDir),
  };
}

export type EndpointStorageRepository = ReturnType<typeof createEndpointStorageRepository>;
