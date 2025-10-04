export * as KrakenApi from './krakenHttp/index.js';
import * as KrakenApi from './krakenHttp/index.js';

export const KrakenApiDefinition = {
  getOrderBook: KrakenApi.GetOrderBookEndpoint,
  getRecentTrades: KrakenApi.GetRecentTradesEndpoint,
} as const;