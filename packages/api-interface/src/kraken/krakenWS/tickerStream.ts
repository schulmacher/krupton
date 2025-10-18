import type {
  ExtractWebSocketStreamMessage,
  ExtractWebSocketStreamParams,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const TickerStream = {
  streamName: 'ticker' as const,
  params: TB.Object({
    symbol: TB.Array(TB.String()),
    event_trigger: TB.Optional(TB.Union([TB.Literal('bbo'), TB.Literal('trades')])),
    snapshot: TB.Optional(TB.Boolean()),
  }),
  messageSchema: TB.Object({
    channel: TB.Literal('ticker'),
    type: TB.Union([TB.Literal('snapshot'), TB.Literal('update')]),
    data: TB.Array(
      TB.Object({
        symbol: TB.String(),
        ask: TB.Number(),
        ask_qty: TB.Number(),
        bid: TB.Number(),
        bid_qty: TB.Number(),
        change: TB.Number(),
        change_pct: TB.Number(),
        high: TB.Number(),
        last: TB.Number(),
        low: TB.Number(),
        volume: TB.Number(),
        vwap: TB.Number(),
      }),
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return String(message?.channel) === 'ticker';
  },
} satisfies WebSocketStreamDefinition;

export type TickerStreamMessage = ExtractWebSocketStreamMessage<typeof TickerStream>;
export type TickerStreamParams = ExtractWebSocketStreamParams<typeof TickerStream>;
