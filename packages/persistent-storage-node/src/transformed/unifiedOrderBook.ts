import { TB } from '@krupton/service-framework-node/typebox';

export const UnifiedOrderBookSnapshot = TB.Object({
  type: TB.Literal('snapshot'),
  symbol: TB.String(),
  bids: TB.Array(TB.Tuple([TB.String(), TB.String()])),
  asks: TB.Array(TB.Tuple([TB.String(), TB.String()])),
  timestamp: TB.Number(),
});

export const UnifiedOrderBookUpdate = TB.Object({
  type: TB.Literal('update'),
  symbol: TB.String(),
  bids: TB.Array(TB.Tuple([TB.String(), TB.String()])),
  asks: TB.Array(TB.Tuple([TB.String(), TB.String()])),
  timestamp: TB.Number(),
});

export const UnifiedOrderBook = TB.Union([UnifiedOrderBookSnapshot, UnifiedOrderBookUpdate]);

export type UnifiedOrderBookSnapshot = TB.Static<typeof UnifiedOrderBookSnapshot>;
export type UnifiedOrderBookUpdate = TB.Static<typeof UnifiedOrderBookUpdate>;
export type UnifiedOrderBook = TB.Static<typeof UnifiedOrderBook>;

