import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition, ExtractEndpointParams } from '@krupton/api-client-node';

export const GetHistoricalTradesEndpoint = {
  path: '/api/v3/historicalTrades',
  method: 'GET',
  querySchema: TB.Object({
    symbol: TB.String(),
    limit: TB.Optional(TB.Integer({ minimum: 1, maximum: 1000, default: 500 })),
    fromId: TB.Optional(TB.Number()),
  }),
  responseSchema: TB.Array(
    TB.Object({
      id: TB.Number(),
      price: TB.String(),
      qty: TB.String(),
      quoteQty: TB.String(),
      time: TB.Number(),
      isBuyerMaker: TB.Boolean(),
      isBestMatch: TB.Boolean(),
    }),
  ),
} satisfies EndpointDefinition;

export type GetHistoricalTradesQuery = TB.Static<typeof GetHistoricalTradesEndpoint.querySchema>;
export type GetHistoricalTradesRequest = ExtractEndpointParams<typeof GetHistoricalTradesEndpoint>;
export type GetHistoricalTradesResponse = TB.Static<
  typeof GetHistoricalTradesEndpoint.responseSchema
>;
