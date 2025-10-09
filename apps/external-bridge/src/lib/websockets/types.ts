export type SubscriptionRequest = {
  method: 'SUBSCRIBE';
  params: string[];
  id: number;
};

export type SubscriptionResponse = {
  result: null;
  id: number;
};
