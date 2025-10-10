import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition, ExtractEndpointParams } from '@krupton/api-client-node';

// https://docs.kraken.com/api/docs/rest-api/get-recent-trades
export const GetRecentTradesEndpoint = {
  path: '/public/Trades',
  method: 'GET',
  querySchema: TB.Object({
    pair: TB.String(),
    since: TB.Optional(TB.String()),
    count: TB.Optional(TB.Integer({ minimum: 1, maximum: 1000 })),
  }),
  responseSchema: TB.Object({
    error: TB.Array(TB.String()),
    result: TB.Object(
      {
        last: TB.String(),
      },
      {
        additionalProperties: TB.Array(
          TB.Tuple([
            TB.String(), // price
            TB.String(), // volume
            TB.Number(), // time
            TB.String(), // buy/sell
            TB.String(), // market/limit
            TB.String(), // miscellaneous
            TB.Number(), // trade id
          ]),
        ),
      },
    ),
  }),
} satisfies EndpointDefinition;

export type GetRecentTradesQuery = TB.Static<typeof GetRecentTradesEndpoint.querySchema>;
export type GetRecentTradesResponse = TB.Static<typeof GetRecentTradesEndpoint.responseSchema>;
export type GetRecentTradesRequest = ExtractEndpointParams<typeof GetRecentTradesEndpoint>;
