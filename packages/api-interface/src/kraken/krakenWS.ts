export * as KrakenWS from './krakenWS/index.js';
import * as KrakenWS from './krakenWS/index.js';

export const KrakenWSDefinition = {
  tickerStream: KrakenWS.TickerStream,
  tradeStream: KrakenWS.TradeStream,
  bookStream: KrakenWS.BookStream,
  level3Stream: KrakenWS.Level3Stream,
  subscriptionStatusStream: KrakenWS.SubscriptionStatusStream,
} as const;

