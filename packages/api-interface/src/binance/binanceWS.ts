export * as BinanceWS from './binanceWS/index.js';
import * as BinanceWS from './binanceWS/index.js';

export const BinanceWSDefinition = {
  tradeStream: BinanceWS.TradeStream,
  partialBookDepthStream: BinanceWS.PartialBookDepthStream,
  diffDepthStream: BinanceWS.DiffDepthStream,
  commonResponseStream: BinanceWS.CommonResponseStream,
} as const;

