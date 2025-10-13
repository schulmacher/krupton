import { BinanceWS } from '@krupton/api-interface';
import type { WebSocketStorageRecord } from '../../entities/websocketStorage.js';
import type { UnifiedOrderBookUpdate } from '../unifiedOrderBook.js';

export function transformBinanceDiffDepthToUnified(
  record: WebSocketStorageRecord<typeof BinanceWS.DiffDepthStream>,
): UnifiedOrderBookUpdate {
  const { message } = record;
  const data = message.data;

  return {
    type: 'update',
    symbol: data.s,
    bids: data.b,
    asks: data.a,
    timestamp: data.E,
  };
}
