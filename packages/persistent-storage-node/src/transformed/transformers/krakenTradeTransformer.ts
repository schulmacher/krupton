import { KrakenApi, KrakenWS } from '@krupton/api-interface';
import type { EndpointStorageRecord } from '../../entities/endpointStorage.js';
import type { WebSocketStorageRecord } from '../../entities/websocketStorage.js';
import type { UnifiedTrade } from '../unifiedTrade.js';

export function transformKrakenTradeWSToUnified(
  record: WebSocketStorageRecord<typeof KrakenWS.TradeStream>,
  normalizedSymbol: string,
): UnifiedTrade[] {
  const { message } = record;
  const trades = message.data;

  return trades.map((trade) => ({
    symbol: normalizedSymbol,
    price: String(trade.price),
    quantity: String(trade.qty),
    time: new Date(trade.timestamp).getTime(),
    platformTradeId: trade.trade_id,
    platform: 'kraken',
    side: trade.side === 'sell' ? 1 : 0, // 0 = buy, 1 = sell
    orderType: trade.ord_type === 'limit' ? 1 : 0, // 0 = market, 1 = limit
  }));
}

export function transformKrakenRecentTradeToUnified(
  record: EndpointStorageRecord<typeof KrakenApi.GetRecentTradesEndpoint>,
  normalizedSymbol: string,
): UnifiedTrade[] {
  const { response } = record;
  const trades: UnifiedTrade[] = [];
  const allKeys = Object.keys(response.result);

  if (allKeys.length > 2) {
    throw new Error('transformKrakenRecentTradeToUnified: Unexpected number of keys in response. result: ' + JSON.stringify(response.result));
  }

  for (const pairKey of allKeys) {
    if (pairKey === 'last') continue;

    const tradeArray = response.result[pairKey as keyof typeof response.result];
    if (!Array.isArray(tradeArray)) continue;

    for (const trade of tradeArray as unknown as KrakenApi.KrakenTradeTuple[]) {
      const [price, volume, time, side, orderType, misc, tradeId] = trade;
      const timestampMs = Math.floor(time * 1000);

      trades.push({
        symbol: normalizedSymbol,
        price,
        quantity: volume,
        time: timestampMs,
        platform: 'kraken',
        platformTradeId: tradeId,
        side: side === 's' ? 1 : 0, // 0 = buy, 1 = sell
        orderType: orderType === 'l' ? 1 : 0, // 0 = market, 1 = limit
        misc,
      });
    }
  }

  return trades;
}

