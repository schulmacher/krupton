import { TB } from '@krupton/service-framework-node/typebox';
import type { WebSocketStreamDefinition, ExtractWebSocketStreamMessage } from '@krupton/api-client-ws-node';

export const TradeStream = {
  streamNamePattern: '<symbol>@trade' as const,
  messageSchema: TB.Object({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return message.e === 'trade';
  },
} satisfies WebSocketStreamDefinition;

export function getTradeStreamSubscriptionName(symbol: string) {
  return `${symbol.toLowerCase()}@trade`;
}

export type TradeStreamMessage = ExtractWebSocketStreamMessage<typeof TradeStream>;
