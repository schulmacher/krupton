import type {
  ExtractWebSocketStreamMessage,
  ExtractWebSocketStreamParams,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const TradeStream = {
  streamName: 'trade' as const,
  params: TB.Object({
    symbol: TB.String(),
  }),
  messageSchema: TB.Object({
    stream: TB.String(),
    data: TB.Object({
      e: TB.Literal('trade'),
      E: TB.Number(), // Event time
      s: TB.String(), // Symbol
      t: TB.Number(), // Trade ID
      p: TB.String(), // Price
      q: TB.String(), // Quantity
      T: TB.Number(), // Trade time
      m: TB.Boolean(), // Is buyer maker
      M: TB.Boolean(), // Ignore
    }),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return String(message?.data?.e) === 'trade';
  },
} satisfies WebSocketStreamDefinition;

export function getTradeStreamSubscriptionName(params: TradeStreamParams) {
  const { symbol } = params;
  return `${symbol.toLowerCase()}@trade`;
}

export type TradeStreamMessage = ExtractWebSocketStreamMessage<typeof TradeStream>;
export type TradeStreamParams = ExtractWebSocketStreamParams<typeof TradeStream>;
