export * as BinanceApi from './binanceHttp/index.js';
import * as BinanceApi from './binanceHttp/index.js';

export const BinanceApiDefinition = {
  getOrderBook: BinanceApi.GetOrderBookEndpoint,
  getBookTicker: BinanceApi.GetBookTickerEndpoint,
  getHistoricalTrades: BinanceApi.GetHistoricalTradesEndpoint,
  getExchangeInfo: BinanceApi.GetExchangeInfoEndpoint,
} as const;
