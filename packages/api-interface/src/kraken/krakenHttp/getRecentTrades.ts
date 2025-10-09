import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition, ExtractEndpointParams } from '@krupton/api-client-node';

export const GetRecentTradesEndpoint = {
  path: '/public/Trades',
  method: 'GET',
  querySchema: TB.Object({
    pair: TB.String(),
    since: TB.Optional(TB.Integer()),
    count: TB.Optional(TB.Integer({ minimum: 1, maximum: 1000 })),
  }),
  responseSchema: TB.Object({
    error: TB.Array(TB.String()),
    result: TB.Record(
      TB.String(),
      TB.Union([
        TB.Array(
          TB.Tuple([
            TB.String(),
            TB.String(),
            TB.Number(),
            TB.String(),
            TB.String(),
            TB.String(),
            TB.Number(),
          ]),
        ),
        TB.String(),
      ]),
    ),
  }),
} satisfies EndpointDefinition;

export type GetRecentTradesQuery = TB.Static<typeof GetRecentTradesEndpoint.querySchema>;
export type GetRecentTradesResponse = TB.Static<typeof GetRecentTradesEndpoint.responseSchema>;
export type GetRecentTradesRequest = ExtractEndpointParams<typeof GetRecentTradesEndpoint>;
