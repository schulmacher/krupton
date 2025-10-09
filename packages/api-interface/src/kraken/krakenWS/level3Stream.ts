import type {
  ExtractWebSocketStreamMessage,
  ExtractWebSocketStreamParams,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const Level3Stream = {
  streamName: 'level3' as const,
  params: TB.Object({
    symbol: TB.Array(TB.String()),
    depth: TB.Optional(
      TB.Union([TB.Literal(10), TB.Literal(100), TB.Literal(1000)]),
    ),
    snapshot: TB.Optional(TB.Boolean()),
    token: TB.Optional(TB.String()),
  }),
  messageSchema: TB.Object({
    channel: TB.Literal('level3'),
    type: TB.Union([TB.Literal('snapshot'), TB.Literal('update')]),
    data: TB.Array(
      TB.Object({
        symbol: TB.String(),
        bids: TB.Array(
          TB.Object({
            order_id: TB.String(),
            limit_price: TB.Number(),
            order_qty: TB.Number(),
            timestamp: TB.String(),
          }),
        ),
        asks: TB.Array(
          TB.Object({
            order_id: TB.String(),
            limit_price: TB.Number(),
            order_qty: TB.Number(),
            timestamp: TB.String(),
          }),
        ),
        checksum: TB.Number(),
        timestamp: TB.String(),
      }),
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return String(message?.channel) === 'level3';
  },
} satisfies WebSocketStreamDefinition;

export type Level3StreamMessage = ExtractWebSocketStreamMessage<typeof Level3Stream>;
export type Level3StreamParams = ExtractWebSocketStreamParams<typeof Level3Stream>;

