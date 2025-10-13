import { KrakenApi, KrakenWS } from '@krupton/api-interface';
import type { EndpointStorageRecord } from '../../entities/endpointStorage.js';
import type { WebSocketStorageRecord } from '../../entities/websocketStorage.js';
import type { UnifiedTrade } from '../unifiedTrade.js';

export function transformKrakenTradeWSToUnified(
  record: WebSocketStorageRecord<typeof KrakenWS.TradeStream>,
): UnifiedTrade[] {
  const { message } = record;
  const trades = message.data;

  return trades.map((trade) => ({
    symbol: trade.symbol,
    price: String(trade.price),
    quantity: String(trade.qty),
    timestamp: new Date(trade.timestamp).getTime(),
    tradeId: trade.trade_id,
    side: trade.side === 'sell' ? 1 : 0, // 0 = buy, 1 = sell
    orderType: trade.ord_type === 'limit' ? 1 : 0, // 0 = market, 1 = limit
  }));
}

export function transformKrakenRecentTradeToUnified(
  record: EndpointStorageRecord<typeof KrakenApi.GetRecentTradesEndpoint>,
): UnifiedTrade[] {
  const { response } = record;
  const trades: UnifiedTrade[] = [];

  for (const [pairKey, tradeArray] of Object.entries(response.result)) {
    if (pairKey === 'last') continue;
    if (!Array.isArray(tradeArray)) continue;

    for (const trade of tradeArray as unknown as KrakenApi.KrakenTradeTuple[]) {
      const [price, volume, time, side, orderType, misc, tradeId] = trade;
      const timestampMs = Math.floor(time * 1000);

      trades.push({
        symbol: pairKey,
        price,
        quantity: volume,
        timestamp: timestampMs,
        tradeId,
        side: side === 's' ? 1 : 0, // 0 = buy, 1 = sell
        orderType: orderType === 'l' ? 1 : 0, // 0 = market, 1 = limit
        misc,
      });
    }
  }

  return trades;
}

