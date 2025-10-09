import type {
  ExtractWebSocketStreamMessage,
  ExtractWebSocketStreamParams,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const DiffDepthStream = {
  streamName: 'diffDepth' as const,
  params: TB.Object({
    symbol: TB.String(),
    time: TB.Union([TB.Literal('100ms'), TB.Literal('1000ms')]),
  }),
  messageSchema: TB.Object({
    stream: TB.String(),
    data: TB.Object({
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
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return String(message?.data?.e) === 'depthUpdate';

  },
} satisfies WebSocketStreamDefinition;

export function getDiffDepthStreamSubscriptionName(params: DiffDepthStreamParams) {
  const { symbol, time } = params;
  return `${symbol.toLowerCase()}@depth@${time}`;
}

export type DiffDepthStreamMessage = ExtractWebSocketStreamMessage<typeof DiffDepthStream>;
export type DiffDepthStreamParams = ExtractWebSocketStreamParams<typeof DiffDepthStream>;
