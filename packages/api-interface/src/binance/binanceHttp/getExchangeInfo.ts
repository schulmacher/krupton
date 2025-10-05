import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition } from '@krupton/api-client-node';

export const GetExchangeInfoEndpoint = {
  path: '/api/v3/exchangeInfo',
  method: 'GET',
  querySchema: TB.Object({
    symbol: TB.Optional(TB.String()),
    symbols: TB.Optional(TB.Array(TB.String())),
    permissions: TB.Optional(TB.String()),
  }),
  responseSchema: TB.Object({
    timezone: TB.String(),
    serverTime: TB.Number(),
    rateLimits: TB.Array(
      TB.Object({
        rateLimitType: TB.String(),
        interval: TB.String(),
        intervalNum: TB.Number(),
        limit: TB.Number(),
      }),
    ),
    symbols: TB.Array(
      TB.Object({
        symbol: TB.String(),
        status: TB.String(),
        baseAsset: TB.String(),
        baseAssetPrecision: TB.Number(),
        quoteAsset: TB.String(),
        quotePrecision: TB.Number(),
        quoteAssetPrecision: TB.Number(),
        orderTypes: TB.Array(TB.String()),
        icebergAllowed: TB.Boolean(),
        ocoAllowed: TB.Boolean(),
        isSpotTradingAllowed: TB.Boolean(),
        isMarginTradingAllowed: TB.Boolean(),
        permissions: TB.Array(TB.String()),
      }),
    ),
  }),
} satisfies EndpointDefinition;

export type GetExchangeInfoQuery = TB.Static<typeof GetExchangeInfoEndpoint.querySchema>;
export type GetExchangeInfoResponse = TB.Static<typeof GetExchangeInfoEndpoint.responseSchema>;
