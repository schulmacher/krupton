import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition, ExtractEndpointParams } from '@krupton/api-client-node';

export const GetOrderBookEndpoint = {
  path: '/api/v3/depth',
  method: 'GET',
  querySchema: TB.Object({
    symbol: TB.String(),
    limit: TB.Optional(TB.Integer({ minimum: 1, maximum: 5000, default: 100 })),
  }),
  responseSchema: TB.Object({
    lastUpdateId: TB.Number(),
    bids: TB.Array(TB.Tuple([TB.String(), TB.String()])),
    asks: TB.Array(TB.Tuple([TB.String(), TB.String()])),
  }),
} satisfies EndpointDefinition;

export type GetOrderBookQuery = TB.Static<typeof GetOrderBookEndpoint.querySchema>;
export type GetOrderBookResponse = TB.Static<typeof GetOrderBookEndpoint.responseSchema>;
export type GetOrderBookRequest = ExtractEndpointParams<typeof GetOrderBookEndpoint>;
