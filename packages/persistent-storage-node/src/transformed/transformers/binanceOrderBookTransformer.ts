import { BinanceApi } from '@krupton/api-interface';
import type { EndpointStorageRecord } from '../../entities/endpointStorage.js';
import type { UnifiedOrderBookSnapshot } from '../unifiedOrderBook.js';

export function transformBinanceOrderBookToUnified(
  record: EndpointStorageRecord<typeof BinanceApi.GetOrderBookEndpoint>,
): UnifiedOrderBookSnapshot {
  const { response, timestamp } = record;
  const symbol = record.request.query?.symbol ?? '';

  if (!symbol) {
    throw new Error('Symbol is required for transforming Binance OrderBook');
  }

  return {
    type: 'snapshot',
    symbol,
    bids: response.bids,
    asks: response.asks,
    timestamp,
  };
}
