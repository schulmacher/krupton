import type {
  ExtractWebSocketStreamMessage,
  ExtractWebSocketStreamParams,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const TradeStream = {
  streamName: 'trade' as const,
  params: TB.Object({
    symbol: TB.Array(TB.String()),
    snapshot: TB.Optional(TB.Boolean()),
  }),
  messageSchema: TB.Object({
    channel: TB.Literal('trade'),
    type: TB.Union([TB.Literal('snapshot'), TB.Literal('update')]),
    data: TB.Array(
      TB.Object({
        symbol: TB.String(),
        side: TB.Union([TB.Literal('buy'), TB.Literal('sell')]),
        price: TB.Number(),
        qty: TB.Number(),
        ord_type: TB.Union([TB.Literal('market'), TB.Literal('limit')]),
        trade_id: TB.Number(),
        timestamp: TB.String(),
      }),
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return String(message?.channel) === 'trade';
  },
} satisfies WebSocketStreamDefinition;

export type TradeStreamMessage = ExtractWebSocketStreamMessage<typeof TradeStream>;
export type TradeStreamParams = ExtractWebSocketStreamParams<typeof TradeStream>;
