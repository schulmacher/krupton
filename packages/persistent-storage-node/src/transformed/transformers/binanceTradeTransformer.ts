import { BinanceApi, BinanceWS } from '@krupton/api-interface';
import type { EndpointStorageRecord } from '../../entities/endpointStorage.js';
import type { WebSocketStorageRecord } from '../../entities/websocketStorage.js';
import type { UnifiedTrade } from '../unifiedTrade.js';

export function transformBinanceTradeWSToUnified(
  record: WebSocketStorageRecord<typeof BinanceWS.TradeStream>,
): UnifiedTrade[] {
  const { message } = record;
  const data = message.data;

  return [
    {
      symbol: data.s,
      price: data.p,
      quantity: data.q,
      timestamp: data.T,
      tradeId: data.t,
      side: data.m ? 1 : 0, // isBuyerMaker: true = sell (1), false = buy (0)
      orderType: 0, // Binance trade stream doesn't include order type, default to market
    },
  ];
}

export function transformBinanceHistoricalTradesToUnified(
  record: EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>,
): UnifiedTrade[] {
  const { response } = record;
  const symbol = record.request.query?.symbol ?? '';

  return response.map((trade) => ({
    symbol,
    price: trade.price,
    quantity: trade.qty,
    timestamp: trade.time,
    tradeId: trade.id,
    side: trade.isBuyerMaker ? 1 : 0, // isBuyerMaker: true = sell (1), false = buy (0)
    orderType: 0, // Binance historical trades don't include order type, default to market
  }));
}

