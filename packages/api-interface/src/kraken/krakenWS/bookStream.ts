import type {
  ExtractWebSocketStreamMessage,
  ExtractWebSocketStreamParams,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

// https://docs.kraken.com/api/docs/websocket-v2/book#snapshot-response
export const BookStream = {
  streamName: 'book' as const,
  params: TB.Object({
    symbol: TB.Array(TB.String()),
    depth: TB.Optional(
      TB.Union([
        TB.Literal(10),
        TB.Literal(25),
        TB.Literal(100),
        TB.Literal(500),
        TB.Literal(1000),
      ]),
    ),
    snapshot: TB.Optional(TB.Boolean()),
  }),
  messageSchema: TB.Object({
    channel: TB.Literal('book'),
    type: TB.Union([TB.Literal('snapshot'), TB.Literal('update')]),
    data: TB.Array(
      TB.Object({
        symbol: TB.String(),
        bids: TB.Array(
          TB.Object({
            price: TB.Number(),
            qty: TB.Number(),
          }),
        ),
        asks: TB.Array(
          TB.Object({
            price: TB.Number(),
            qty: TB.Number(),
          }),
        ),
        checksum: TB.Number(),
        timestamp: TB.Optional(TB.String()), // only for updates
      }),
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return String(message?.channel) === 'book';
  },
} satisfies WebSocketStreamDefinition;

export type BookStreamMessage = ExtractWebSocketStreamMessage<typeof BookStream>;
export type BookStreamParams = ExtractWebSocketStreamParams<typeof BookStream>;

