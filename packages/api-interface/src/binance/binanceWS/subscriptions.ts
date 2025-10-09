import type {
  ExtractWebSocketStreamMessage,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

// Request Types
export const SubscribeRequest = TB.Object({
  method: TB.Literal('SUBSCRIBE'),
  params: TB.Array(TB.String()),
  id: TB.Number(),
});

export type SubscribeRequest = TB.Static<typeof SubscribeRequest>;

export const UnsubscribeRequest = TB.Object({
  method: TB.Literal('UNSUBSCRIBE'),
  params: TB.Array(TB.String()),
  id: TB.Number(),
});

export type UnsubscribeRequest = TB.Static<typeof UnsubscribeRequest>;

export const ListSubscriptionsRequest = TB.Object({
  method: TB.Literal('LIST_SUBSCRIPTIONS'),
  id: TB.Number(),
});

export type ListSubscriptionsRequest = TB.Static<typeof ListSubscriptionsRequest>;

export const CommonResponseStream = {
  streamNamePattern: 'SUBSCRIBE_RESPONSE' as const,
  messageSchema: TB.Union([
    // Success response
    TB.Object({
      result: TB.Any(),
      id: TB.Number(),
    }),
    // Error response
    TB.Object({
      error: TB.Object({
        code: TB.Number(),
        msg: TB.String(),
      }),
      id: TB.Number(),
    }),
  ]),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return !!message?.id;
  },
} satisfies WebSocketStreamDefinition;

export type CommonResponseStream = ExtractWebSocketStreamMessage<typeof CommonResponseStream>;
