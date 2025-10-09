import type {
  ExtractWebSocketStreamMessage,
  ExtractWebSocketStreamParams,
  WebSocketStreamDefinition,
} from '@krupton/api-client-ws-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const PartialBookDepthStream = {
  streamName: 'partialBookDepth' as const,
  params: TB.Object({
    symbol: TB.String(),
    level: TB.Union([TB.Literal('5'), TB.Literal('10'), TB.Literal('20')]),
    time: TB.Union([TB.Literal('100ms'), TB.Literal('1000ms')]),
  }),
  messageSchema: TB.Object({
    stream: TB.String(),
    data: TB.Object({
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
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageIdentifier: (message: any): boolean => {
    return (
      String(message?.stream).includes('@depth') &&
      !!message?.data?.lastUpdateId &&
      !!message?.data?.bids &&
      !!message?.data?.asks
    );
  },
} satisfies WebSocketStreamDefinition;

export function getPartialBookDepthStreamSubscriptionName(params: PartialBookDepthStreamParams) {
  const { symbol, level, time } = params;
  return `${symbol.toLowerCase()}@depth${level}@${time}`;
}

export type PartialBookDepthStreamMessage = ExtractWebSocketStreamMessage<
  typeof PartialBookDepthStream
>;
export type PartialBookDepthStreamParams = ExtractWebSocketStreamParams<
  typeof PartialBookDepthStream
>;
