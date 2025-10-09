import type {
  ExtractWebSocketStreamMessage,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const DiffDepthStream = {
  streamNamePattern: '<symbol>@depth[@100ms]' as const,
  messageSchema: TB.Object({
    e: TB.Literal('depthUpdate'),
    E: TB.Number(), // Event time
    s: TB.String(), // Symbol
    U: TB.Number(), // First update ID
    u: TB.Number(), // Final update ID
    b: TB.Array(
      TB.Tuple([
        TB.String(), // price
        TB.String(), // quantity
      ]),
    ),
    a: TB.Array(
      TB.Tuple([
        TB.String(), // price
        TB.String(), // quantity
      ]),
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return message?.e === 'depthUpdate';
  },
} satisfies WebSocketStreamDefinition;

export function getDiffDepthStreamSubscriptionName(symbol: string, time: '100ms' | '1000ms' = '1000ms') {
  return `${symbol.toLowerCase()}@depth@${time}`;
}

export type DiffDepthStreamMessage = ExtractWebSocketStreamMessage<typeof DiffDepthStream>;
