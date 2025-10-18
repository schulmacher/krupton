export const zmqSocketTempalatesRawData = {
  binanceTradeApi: (symbol: string) => `ipc:///tmp/zmq-pubsub-binance-trade-api-${symbol}.sock`,
  binanceTradeWs: (symbol: string) => `ipc:///tmp/zmq-pubsub-binance-trade-ws-${symbol}.sock`,
  binanceDiffDepth: (symbol: string) => `ipc:///tmp/zmq-pubsub-binance-diff-depth-${symbol}.sock`,
  binanceOrderBook: (symbol: string) => `ipc:///tmp/zmq-pubsub-binance-order-book-${symbol}.sock`,

  krakenTradeApi: (symbol: string) => `ipc:///tmp/zmq-pubsub-kraken-trade-api-${symbol}.sock`,
  krakenTradeWs: (symbol: string) => `ipc:///tmp/zmq-pubsub-kraken-trade-ws-${symbol}.sock`,
  krakenOrderBookWs: (symbol: string) => `ipc:///tmp/zmq-pubsub-kraken-order-book-ws-${symbol}.sock`,
} as const;

export const zmqSocketTempalatesUnifiedData = {
  trade: (symbol: string) => `ipc:///tmp/zmq-pubsub-unified-trade-${symbol}.sock`,
  orderBook: (symbol: string) => `ipc:///tmp/zmq-pubsub-unified-order-book-${symbol}.sock`,
} as const;
