import { TB } from '@krupton/service-framework-node/typebox';
import type { EndpointDefinition } from '@krupton/api-client-node';

export const GetAssetPairsEndpoint = {
  path: '/public/AssetPairs',
  method: 'GET',
  querySchema: TB.Object({
    pair: TB.Optional(TB.String()),
    info: TB.Optional(TB.String()),
  }),
  responseSchema: TB.Object({
    error: TB.Array(TB.String()),
    result: TB.Record(
      TB.String(),
      TB.Object({
        altname: TB.String(),
        wsname: TB.String(),
        aclass_base: TB.Optional(TB.String()),
        base: TB.String(),
        aclass_quote: TB.Optional(TB.String()),
        quote: TB.String(),
        pair_decimals: TB.Optional(TB.Number()),
        cost_decimals: TB.Optional(TB.Number()),
        lot_decimals: TB.Optional(TB.Number()),
        lot_multiplier: TB.Optional(TB.Number()),
        leverage_buy: TB.Optional(TB.Array(TB.Number())),
        leverage_sell: TB.Optional(TB.Array(TB.Number())),
        fees: TB.Optional(TB.Array(TB.Tuple([TB.Number(), TB.Number()]))),
        fees_maker: TB.Optional(TB.Array(TB.Tuple([TB.Number(), TB.Number()]))),
        fee_volume_currency: TB.Optional(TB.String()),
        margin_call: TB.Optional(TB.Number()),
        margin_stop: TB.Optional(TB.Number()),
        ordermin: TB.Optional(TB.String()),
        costmin: TB.Optional(TB.String()),
        tick_size: TB.Optional(TB.String()),
        status: TB.String(),
      }),
    ),
  }),
} satisfies EndpointDefinition;

export type GetAssetPairsQuery = TB.Static<typeof GetAssetPairsEndpoint.querySchema>;
export type GetAssetPairsResponse = TB.Static<typeof GetAssetPairsEndpoint.responseSchema>;
