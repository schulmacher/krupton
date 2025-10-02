import { z } from 'zod';

export const orderSideSchema = z.enum(['buy', 'sell']);

export const orderRequestSchema = z.object({
  symbol: z.string().min(1),
  side: orderSideSchema,
  quantity: z.number().positive(),
  price: z.number().positive(),
  timestamp: z.number().int().positive(),
});

export const orderResponseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['accepted', 'rejected']),
  reason: z.string().optional(),
});

export type OrderRequest = z.infer<typeof orderRequestSchema>;
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const tradeMessageSchema = z.object({
  type: z.literal('trade'),
  symbol: z.string().min(1),
  price: z.number().positive(),
  quantity: z.number().positive(),
  ts: z.number().int().positive(),
});

export const offerMessageSchema = z.object({
  type: z.literal('offer'),
  symbol: z.string().min(1),
  side: z.enum(['bid', 'ask']),
  price: z.number().positive(),
  quantity: z.number().positive(),
  ts: z.number().int().positive(),
});

export const wsMessageSchema = z.union([tradeMessageSchema, offerMessageSchema]);

export type TradeMessage = z.infer<typeof tradeMessageSchema>;
export type OfferMessage = z.infer<typeof offerMessageSchema>;
export type WsMessage = z.infer<typeof wsMessageSchema>;
