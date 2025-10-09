import type {
  ExtractWebSocketStreamMessage,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const PartialBookDepthStream = {
  streamNamePattern: '<symbol>@depth<levels>[@100ms]' as const,
  messageSchema: TB.Object({
    lastUpdateId: TB.Number(),
    bids: TB.Array(
      TB.Tuple([
        TB.String(), // price
        TB.String(), // quantity
      ]),
    ),
    asks: TB.Array(
      TB.Tuple([
        TB.String(), // price
        TB.String(), // quantity
      ]),
    ),
  }),
  messageIdentifier: (message: unknown): boolean => {
    return (
      typeof message === 'object' &&
      message !== null &&
      'lastUpdateId' in message &&
      'bids' in message &&
      'asks' in message &&
      !('e' in message)
    );
  },
} satisfies WebSocketStreamDefinition;

export function getPartialBookDepthStreamSubscriptionName(
  symbol: string,
  level: '5' | '10' | '20' = '5',
  time: '100ms' | '1000ms' = '1000ms',
) {
  return `${symbol.toLowerCase()}@depth${level}@${time}`;
}

export type PartialBookDepthStreamMessage = ExtractWebSocketStreamMessage<
  typeof PartialBookDepthStream
>;
