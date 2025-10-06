import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition } from '@krupton/api-client-node';

export const GetBookTickerEndpoint = {
  path: '/api/v3/ticker/bookTicker',
  method: 'GET',
  querySchema: TB.Object({
    symbol: TB.Optional(TB.String()),
    // symbols: TB.Optional(TB.Array(TB.String(), { maxItems: 100 })),
  }),
  responseSchema: TB.Union([
    TB.Object({
      symbol: TB.String(),
      bidPrice: TB.String(),
      bidQty: TB.String(),
      askPrice: TB.String(),
      askQty: TB.String(),
    }),
    TB.Array(
      TB.Object({
        symbol: TB.String(),
        bidPrice: TB.String(),
        bidQty: TB.String(),
        askPrice: TB.String(),
        askQty: TB.String(),
      }),
    ),
  ]),
} satisfies EndpointDefinition;

export type GetBookTickerQuery = TB.Static<
  typeof GetBookTickerEndpoint.querySchema
>;
export type GetBookTickerResponse = TB.Static<
  typeof GetBookTickerEndpoint.responseSchema
>;
