import type {
  ExtractWebSocketStreamMessage,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const SubscribeRequest = TB.Object({
  method: TB.Literal('subscribe'),
  params: TB.Object({
    channel: TB.String(),
    symbol: TB.Array(TB.String()),
    snapshot: TB.Optional(TB.Boolean()),
    depth: TB.Optional(TB.Number()),
  }),
});

export type SubscribeRequest = TB.Static<typeof SubscribeRequest>;

export const UnsubscribeRequest = TB.Object({
  method: TB.Literal('unsubscribe'),
  params: TB.Object({
    channel: TB.String(),
    symbol: TB.Array(TB.String()),
  }),
});

export type UnsubscribeRequest = TB.Static<typeof UnsubscribeRequest>;

export const SubscriptionStatusStream = {
  streamName: 'subscriptionStatus' as const,
  params: TB.Object({
    method: TB.Union([TB.Literal('subscribe'), TB.Literal('unsubscribe')]),
    channel: TB.String(),
    symbol: TB.Array(TB.String()),
  }),
  messageSchema: TB.Union([
    TB.Object({
      method: TB.Union([TB.Literal('subscribe'), TB.Literal('unsubscribe')]),
      result: TB.Object({
        channel: TB.String(),
        snapshot: TB.Boolean(),
        symbol: TB.String(),
      }),
      success: TB.Boolean(),
      time_in: TB.String(),
      time_out: TB.String(),
    }),
    TB.Object({
      error: TB.String(),
      method: TB.Union([TB.Literal('subscribe'), TB.Literal('unsubscribe')]),
      success: TB.Boolean(),
      time_in: TB.String(),
      time_out: TB.String(),
    }),
  ]),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return (
      (message?.method === 'subscribe' || message?.method === 'unsubscribe') &&
      message?.success !== undefined
    );
  },
} satisfies WebSocketStreamDefinition;

export type SubscriptionStatusStream = ExtractWebSocketStreamMessage<
  typeof SubscriptionStatusStream
>;

export const HeartbeatStream = {
  streamName: 'heartbeat',
  params: TB.Object({}),
  messageSchema: TB.Object({
    channel: TB.String(),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return message?.channel === 'heartbeat';
  },
} satisfies WebSocketStreamDefinition;

export type HeartbeatStream = ExtractWebSocketStreamMessage<typeof HeartbeatStream>;

export const StatusStream = {
  streamName: 'status',
  params: TB.Object({}),
  messageSchema: TB.Object({
    channel: TB.Literal('status'),
    type: TB.Literal('update'),
    data: TB.Array(
      TB.Object({
        system: TB.Union([
          TB.Literal('online'),
          TB.Literal('cancel_only'),
          TB.Literal('maintenance'),
          TB.Literal('post_only'),
        ]),
        api_version: TB.String(),
        connection_id: TB.Optional(TB.Number()),
        version: TB.String(),
      }),
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return message?.channel === 'status';
  },
} satisfies WebSocketStreamDefinition;

export type StatusStream = ExtractWebSocketStreamMessage<typeof StatusStream>;
