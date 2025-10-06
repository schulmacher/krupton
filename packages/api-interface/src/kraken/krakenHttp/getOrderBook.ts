import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition } from '@krupton/api-client-node';

export const GetOrderBookEndpoint = {
  path: '/public/Depth',
  method: 'GET',
  querySchema: TB.Object({
    pair: TB.String(),
    count: TB.Optional(TB.Integer({ minimum: 1 })),
  }),
  responseSchema: TB.Object({
    error: TB.Array(TB.String()),
    result: TB.Record(
      TB.String(),
      TB.Object({
        asks: TB.Array(TB.Tuple([TB.String(), TB.String(), TB.Number()])),
        bids: TB.Array(TB.Tuple([TB.String(), TB.String(), TB.Number()])),
      }),
    ),
  }),
} satisfies EndpointDefinition;

export type GetOrderBookQuery = TB.Static<typeof GetOrderBookEndpoint.querySchema>;
export type GetOrderBookResponse = TB.Static<typeof GetOrderBookEndpoint.responseSchema>;
