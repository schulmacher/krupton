import { KrakenWS } from '@krupton/api-interface';
import type { WebSocketStorageRecord } from '../../entities/websocketStorage.js';
import type { UnifiedOrderBook } from '../unifiedOrderBook.js';

function convertKrakenBookLevelsToTuples(
  levels: Array<{ price: number; qty: number }>,
): Array<[string, string]> {
  return levels.map((level) => [String(level.price), String(level.qty)]);
}

export function transformKrakenBookWSToUnified(
  record: WebSocketStorageRecord<typeof KrakenWS.BookStream>,
  normalizedSymbol: string,
): UnifiedOrderBook[] {
  const { message, timestamp } = record;

  return message.data.map((data) => {
    const bids = convertKrakenBookLevelsToTuples(data.bids);
    const asks = convertKrakenBookLevelsToTuples(data.asks);
    const eventTimestamp = data.timestamp ? new Date(data.timestamp).getTime() : timestamp;

    return {
      type: message.type === 'snapshot' ? 'snapshot' : 'update',
      symbol: normalizedSymbol,
      bids,
      asks,
      time: eventTimestamp,
      platform: 'kraken',
    } satisfies UnifiedOrderBook;
  });
}
