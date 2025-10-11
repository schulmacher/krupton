import { join } from 'node:path';
import {
  createBinanceBookTickerEntity,
  type BinanceBookTickerEntity,
} from './endpointStorageEntity/binanceBookTickerEntity.js';
import {
  createBinanceExchangeInfoEntity,
  type BinanceExchangeInfoEntity,
} from './endpointStorageEntity/binanceExchangeInfoEntity.js';
import {
  createBinanceHistoricalTradeEntity,
  type BinanceHistoricalTradeEntity,
} from './endpointStorageEntity/binanceHistoricalTradeEntity.js';
import {
  createBinanceOrderBookEntity,
  type BinanceOrderBookEntity,
} from './endpointStorageEntity/binanceOrderBookEntity.js';
import {
  createKrakenAssetInfoEntity,
  type KrakenAssetInfoEntity,
} from './endpointStorageEntity/krakenAssetInfoEntity.js';
import {
  createKrakenAssetPairsEntity,
  type KrakenAssetPairsEntity,
} from './endpointStorageEntity/krakenAssetPairsEntity.js';
import {
  createKrakenOrderBookEntity,
  type KrakenOrderBookEntity,
} from './endpointStorageEntity/krakenOrderBookEntity.js';
import {
  createKrakenRecentTradesEntity,
  type KrakenRecentTradesEntity,
} from './endpointStorageEntity/krakenRecentTradesEntity.js';

export function createEndpointStorageRepository(storageBaseDir: string): {
  binanceBookTicker: BinanceBookTickerEntity;
  binanceOrderBook: BinanceOrderBookEntity;
  binanceHistoricalTrade: BinanceHistoricalTradeEntity;
  binanceExchangeInfo: BinanceExchangeInfoEntity;
  krakenAssetInfo: KrakenAssetInfoEntity;
  krakenAssetPairs: KrakenAssetPairsEntity;
  krakenOrderBook: KrakenOrderBookEntity;
  krakenRecentTrades: KrakenRecentTradesEntity;
} {
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
