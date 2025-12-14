## WebSocket Connection Methods

This document describes connection strategies and implementations for WebSocket streams across different exchanges.

## Binance Connection Methods

### Which Connection Method to Prefer?

**Single Stream Connection:**

- ✅ **Use when:** You need only one stream
- ✅ **Pros:** Simplest implementation, minimal overhead
- ❌ **Cons:** Limited to one stream, inefficient for multiple streams
- 💡 **Best for:** Simple monitoring applications, single pair trading bots

**Combined Streams Connection:**

- ✅ **Use when:** You know all required streams upfront and they won't change
- ✅ **Pros:** Efficient resource usage, multiple streams in one connection
- ❌ **Cons:** Fixed streams at connection time, requires reconnection to change
- 💡 **Best for:** Dashboards, market overview displays, static multi-pair monitoring

**Dynamic Streams Connection (Recommended for most cases):**

- ✅ **Use when:** Streams may change based on runtime conditions or user actions
- ✅ **Pros:** Maximum flexibility, no reconnection needed, adapts to changing requirements
- ❌ **Cons:** Slightly more complex implementation, need to manage subscription state
- 💡 **Best for:** Interactive applications, user-driven stream selection, adaptive trading systems

**General Recommendation:** Use **dynamic subscription** for production applications. The added complexity is minimal compared to the benefits of runtime flexibility. Combined streams are acceptable for fixed use cases, while single streams are mainly useful for testing or very simple scenarios.

### Dynamic Subscription Support on Other Platforms

Dynamic WebSocket subscriptions are widely supported across major cryptocurrency exchanges:

- **Binance:** ✅ Full support (SUBSCRIBE/UNSUBSCRIBE methods)
- **Kraken:** ✅ Supports subscribe/unsubscribe messages
- **Coinbase Advanced Trade:** ✅ Supports dynamic channel subscriptions
- **OKX:** ✅ Supports dynamic subscription via op: subscribe/unsubscribe
- **Bybit:** ✅ Supports dynamic subscriptions
- **Gate.io:** ✅ Supports dynamic subscriptions

Most modern exchange APIs follow similar patterns:

1. Connect to WebSocket endpoint
2. Send JSON subscribe/unsubscribe messages
3. Receive confirmation and data

**Note:** Implementation details vary between platforms. Always check the specific exchange's documentation for exact message formats and capabilities.

## Kraken Connection Method

**Kraken WebSocket v2 Connection:** Dynamic subscription only

Unlike Binance, Kraken WebSocket API v2 uses a **single connection method** with dynamic subscriptions:

1. Connect to WebSocket endpoint: `wss://ws.kraken.com/v2`
2. Send subscribe/unsubscribe messages after connection
3. Receive acknowledgment and data

**Advantages:**

- ✅ Maximum flexibility for changing subscriptions
- ✅ No reconnection needed to modify streams
- ✅ Consistent API across all use cases
- ✅ Support for multiple symbols per channel

**General Pattern:**

```typescript
// Subscribe
{
  "method": "subscribe",
  "params": { "channel": "trade", "symbol": ["BTC/USD"] },
  "req_id": 1
}

// Unsubscribe
{
  "method": "unsubscribe",
  "params": { "channel": "trade", "symbol": ["BTC/USD"] },
  "req_id": 2
}
```

## TypeScript Implementation Examples

### Binance WebSocket Connections

```typescript
import WebSocket from 'ws';

interface BinanceTradeEvent {
  e: 'trade';
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
  M: boolean;
}

interface BinancePartialDepthEvent {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface BinanceDepthUpdateEvent {
  e: 'depthUpdate';
  E: number;
  s: string;
  U: number;
  u: number;
  b: [string, string][];
  a: [string, string][];
}

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443';

const connectToSingleStream = (streamName: string) => {
  const ws = new WebSocket(`${BINANCE_WS_BASE}/ws/${streamName}`);

  ws.on('open', () => {
    console.log(`Connected to ${streamName}`);
  });

  ws.on('message', (data: WebSocket.Data) => {
    const event = JSON.parse(data.toString());
    console.log('Received:', event);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('Connection closed');
  });

  ws.on('ping', () => {
    ws.pong();
  });

  return ws;
};

const connectToCombinedStreams = (streams: string[]) => {
  const streamParams = streams.join('/');
  const ws = new WebSocket(`${BINANCE_WS_BASE}/stream?streams=${streamParams}`);

  ws.on('open', () => {
    console.log(`Connected to combined streams: ${streams.join(', ')}`);
  });

  ws.on('message', (data: WebSocket.Data) => {
    const payload = JSON.parse(data.toString());
    console.log(`Stream: ${payload.stream}`);
    console.log('Data:', payload.data);
  });

  ws.on('ping', () => {
    ws.pong();
  });

  return ws;
};

const subscribeToStreamsAfterConnection = () => {
  const ws = new WebSocket(`${BINANCE_WS_BASE}/ws`);

  ws.on('open', () => {
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: ['btcusdt@trade', 'btcusdt@depth5', 'ethusdt@depth@100ms'],
      id: 1,
    };

    ws.send(JSON.stringify(subscribeMessage));
  });

  ws.on('message', (data: WebSocket.Data) => {
    const message = JSON.parse(data.toString());

    if (message.result === null && message.id) {
      console.log('Subscription confirmed');
    } else {
      console.log('Event received:', message);
    }
  });

  return ws;
};

const singleStreamConnection = connectToSingleStream('btcusdt@trade');

const combinedStreamConnection = connectToCombinedStreams([
  'btcusdt@trade',
  'btcusdt@depth10',
  'ethusdt@depth@100ms',
]);

const dynamicSubscription = subscribeToStreamsAfterConnection();
```

### Kraken WebSocket Connection

```typescript
import WebSocket from 'ws';

interface KrakenTradeData {
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  qty: number;
  ord_type: 'limit' | 'market';
  trade_id: number;
  timestamp: string;
}

interface KrakenTradeMessage {
  channel: 'trade';
  type: 'snapshot' | 'update';
  data: KrakenTradeData[];
}

interface KrakenBookLevel {
  price: number;
  qty: number;
}

interface KrakenBookData {
  symbol: string;
  bids: KrakenBookLevel[];
  asks: KrakenBookLevel[];
  checksum: number;
  timestamp: string;
}

interface KrakenBookMessage {
  channel: 'book';
  type: 'snapshot' | 'update';
  data: KrakenBookData[];
}

interface KrakenSubscribeAck {
  method: 'subscribe';
  result: {
    channel: string;
    symbol: string;
    snapshot?: boolean;
    depth?: number;
  };
  success: boolean;
  time_in: string;
  time_out: string;
  req_id?: number;
}

const KRAKEN_WS_V2 = 'wss://ws.kraken.com/v2';

const connectToKraken = () => {
  const ws = new WebSocket(KRAKEN_WS_V2);
  let requestId = 1;

  ws.on('open', () => {
    console.log('Connected to Kraken WebSocket v2');

    const subscribeToTrade = {
      method: 'subscribe',
      params: {
        channel: 'trade',
        symbol: ['BTC/USD', 'ETH/USD'],
        snapshot: true,
      },
      req_id: requestId++,
    };

    ws.send(JSON.stringify(subscribeToTrade));

    const subscribeToBook = {
      method: 'subscribe',
      params: {
        channel: 'book',
        symbol: ['BTC/USD'],
        depth: 10,
        snapshot: true,
      },
      req_id: requestId++,
    };

    ws.send(JSON.stringify(subscribeToBook));
  });

  ws.on('message', (data: WebSocket.Data) => {
    const message = JSON.parse(data.toString());

    if (message.method === 'subscribe') {
      const ack = message as KrakenSubscribeAck;
      if (ack.success) {
        console.log(`Subscribed to ${ack.result.channel} for ${ack.result.symbol}`);
      } else {
        console.error('Subscription failed:', message);
      }
    } else if (message.channel === 'trade') {
      const tradeMessage = message as KrakenTradeMessage;
      console.log(`Trade ${tradeMessage.type}:`, tradeMessage.data);
    } else if (message.channel === 'book') {
      const bookMessage = message as KrakenBookMessage;
      console.log(`Book ${bookMessage.type}:`, bookMessage.data);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('Connection closed');
  });

  return {
    ws,
    subscribe: (channel: string, symbols: string[], options?: Record<string, unknown>) => {
      ws.send(
        JSON.stringify({
          method: 'subscribe',
          params: {
            channel,
            symbol: symbols,
            ...options,
          },
          req_id: requestId++,
        }),
      );
    },
    unsubscribe: (channel: string, symbols: string[]) => {
      ws.send(
        JSON.stringify({
          method: 'unsubscribe',
          params: {
            channel,
            symbol: symbols,
          },
          req_id: requestId++,
        }),
      );
    },
  };
};

const krakenConnection = connectToKraken();

setTimeout(() => {
  krakenConnection.subscribe('trade', ['MATIC/USD'], { snapshot: false });
}, 5000);

setTimeout(() => {
  krakenConnection.unsubscribe('trade', ['ETH/USD']);
}, 10000);
```

## Key Differences Summary

| Feature                  | Binance                                        | Kraken                                 |
| ------------------------ | ---------------------------------------------- | -------------------------------------- |
| **Connection Methods**   | Single, Combined, Dynamic                      | Dynamic only                           |
| **Endpoint Structure**   | Multiple URL patterns                          | Single endpoint                        |
| **Subscription Format**  | SUBSCRIBE/UNSUBSCRIBE                          | subscribe/unsubscribe                  |
| **Message Structure**    | Varies by connection type                      | Consistent channel-based               |
| **Multi-symbol Support** | Via combined streams or multiple subscriptions | Native in params array                 |
| **Acknowledgment**       | `{result: null, id: N}`                        | `{method: "subscribe", success: true}` |
| **Stream Naming**        | `symbol@type` (e.g., `btcusdt@trade`)          | Channel + symbol params                |

## Best Practices

1. **Connection Management:**
   - Implement automatic reconnection with exponential backoff
   - Handle ping/pong to maintain connection health
   - Monitor connection state and log connection events

2. **Subscription Management:**
   - Track active subscriptions to avoid duplicates
   - Use request IDs to match confirmations with requests
   - Implement subscription cleanup on disconnect

3. **Error Handling:**
   - Parse and handle subscription errors appropriately
   - Implement retry logic for failed subscriptions
   - Log errors with context for debugging

4. **Performance:**
   - Batch subscription requests when possible
   - Use appropriate buffer sizes for high-frequency data
   - Consider rate limits when subscribing to multiple streams

5. **Data Processing:**
   - Validate message structure before processing
   - Handle both snapshot and update message types
   - Implement data validation and sanitization
