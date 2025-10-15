import { TB } from '@krupton/service-framework-node/typebox';

export const UnifiedTrade = TB.Object({
  symbol: TB.String(),
  price: TB.String(),
  quantity: TB.String(),
  time: TB.Number(),
  platformTradeId: TB.Number(),
  platform: TB.String(),
  side: TB.Union([TB.Literal(0), TB.Literal(1)]), // 0 = buy, 1 = sell
  orderType: TB.Union([TB.Literal(0), TB.Literal(1)]), // 0 = market, 1 = limit
  misc: TB.Optional(TB.String()),
});

export type UnifiedTrade = TB.Static<typeof UnifiedTrade>;

