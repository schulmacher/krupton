import { BinanceApi, BinanceWS } from '@krupton/api-interface';
import type { EndpointStorageRecord } from '../../entities/endpointStorage.js';
import type { WebSocketStorageRecord } from '../../entities/websocketStorage.js';
import type { UnifiedTrade } from '../unifiedTrade.js';

export function transformBinanceTradeWSToUnified(
  record: WebSocketStorageRecord<typeof BinanceWS.TradeStream>,
  normalizedSymbol: string,
): UnifiedTrade {
  const { message } = record;
  const data = message.data;

  return {
    symbol: normalizedSymbol,
    price: data.p,
    quantity: data.q,
    time: data.T,
    platformTradeId: data.t,
    platform: 'binance',
    side: data.m ? 1 : 0, // isBuyerMaker: true = sell (1), false = buy (0)
    orderType: 0, // Binance trade stream doesn't include order type, default to market
  };
}

export function transformBinanceHistoricalTradesToUnified(
  record: EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>,
): UnifiedTrade[] {
  const { response } = record;
  const symbol = record.request.query?.symbol ?? '';

  return response.map((trade) => transformBinanceHistoricalTradeToUnified(trade, symbol));
}

export function transformBinanceHistoricalTradeToUnified(
  trade: EndpointStorageRecord<typeof BinanceApi.GetHistoricalTradesEndpoint>['response'][number],
  normalizedSymbol: string,
): UnifiedTrade {
  return {
    symbol: normalizedSymbol,
    price: trade.price,
    quantity: trade.qty,
    time: trade.time,
    platformTradeId: trade.id,
    platform: 'binance',
    side: trade.isBuyerMaker ? 1 : 0, // isBuyerMaker: true = sell (1), false = buy (0)
    orderType: 0, // Binance historical trades don't include order type, default to market
  };
}
