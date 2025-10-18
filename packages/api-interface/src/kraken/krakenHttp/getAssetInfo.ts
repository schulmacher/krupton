import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition, ExtractEndpointParams } from '@krupton/api-client-node';

export const GetAssetInfoEndpoint = {
  path: '/public/Assets',
  method: 'GET',
  querySchema: TB.Object({
    asset: TB.Optional(TB.String()),
    aclass: TB.Optional(TB.String()),
  }),
  responseSchema: TB.Object({
    error: TB.Array(TB.String()),
    result: TB.Record(
      TB.String(),
      TB.Object({
        aclass: TB.String(),
        altname: TB.String(),
        decimals: TB.Number(),
        display_decimals: TB.Number(),
        collateral_value: TB.Optional(TB.Number()),
        status: TB.Optional(TB.String()),
      }),
    ),
  }),
} satisfies EndpointDefinition;

export type GetAssetInfoQuery = TB.Static<typeof GetAssetInfoEndpoint.querySchema>;
export type GetAssetInfoResponse = TB.Static<typeof GetAssetInfoEndpoint.responseSchema>;
export type GetAssetInfoRequest = ExtractEndpointParams<typeof GetAssetInfoEndpoint>;
