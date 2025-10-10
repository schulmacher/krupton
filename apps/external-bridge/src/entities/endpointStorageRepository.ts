import { join } from 'node:path';
import { createBinanceBookTickerEntity } from './endpointStorageEntity/binanceBookTickerEntity.js';
import { createBinanceExchangeInfoEntity } from './endpointStorageEntity/binanceExchangeInfoEntity.js';
import { createBinanceHistoricalTradeEntity } from './endpointStorageEntity/binanceHistoricalTradeEntity.js';
import { createBinanceOrderBookEntity } from './endpointStorageEntity/binanceOrderBookEntity.js';
import { createKrakenAssetInfoEntity } from './endpointStorageEntity/krakenAssetInfoEntity.js';
import { createKrakenAssetPairsEntity } from './endpointStorageEntity/krakenAssetPairsEntity.js';
import { createKrakenOrderBookEntity } from './endpointStorageEntity/krakenOrderBookEntity.js';
import { createKrakenRecentTradesEntity } from './endpointStorageEntity/krakenRecentTradesEntity.js';

export function createEndpointStorageRepository(storageBaseDir: string) {
  const binanceBaseDir = join(storageBaseDir, 'binance');
  const krakenBaseDir = join(storageBaseDir, 'kraken');

  return {
    binanceBookTicker: createBinanceBookTickerEntity(binanceBaseDir),
    binanceOrderBook: createBinanceOrderBookEntity(binanceBaseDir),
    binanceHistoricalTrade: createBinanceHistoricalTradeEntity(binanceBaseDir),
    binanceExchangeInfo: createBinanceExchangeInfoEntity(binanceBaseDir),
    krakenAssetInfo: createKrakenAssetInfoEntity(krakenBaseDir),
    krakenAssetPairs: createKrakenAssetPairsEntity(krakenBaseDir),
    krakenOrderBook: createKrakenOrderBookEntity(krakenBaseDir),
    krakenRecentTrades: createKrakenRecentTradesEntity(krakenBaseDir),
  };
}

export type EndpointStorageRepository = ReturnType<typeof createEndpointStorageRepository>;
