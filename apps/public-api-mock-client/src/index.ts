import { OfferMessage, offerMessageSchema, orderRequestSchema, tradeMessageSchema } from '@krupton/interface';
import { sleep } from '@krupton/utils';
import { WebSocket } from 'ws';

const httpEndpoint = 'http://localhost:3000';
const wsEndpoint = 'ws://localhost:3000/ws';

function randomFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

async function sendOrder() {
  const order = orderRequestSchema.parse({
    symbol: 'BTCUSDT',
    side: Math.random() > 0.5 ? 'buy' : 'sell',
    quantity: randomFloat(0.001, 0.5),
    price: randomFloat(20000, 70000),
    timestamp: Date.now(),
  });
  const res = await fetch(`${httpEndpoint}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(order),
  });
  const json = await res.json();
  console.log('REST response', json);
}

function startWsBurst(ws: WebSocket) {
  // burst of trades
  for (let i = 0; i < 100; i++) {
    const trade = tradeMessageSchema.parse({
      type: 'trade',
      symbol: 'BTCUSDT',
      price: randomFloat(20000, 70000),
      quantity: randomFloat(0.0001, 2),
      ts: Date.now(),
    });
    ws.send(JSON.stringify(trade));
  }
  // burst of offers
  for (let i = 0; i < 100; i++) {
    const offer = offerMessageSchema.parse({
      type: 'offer',
      symbol: 'BTCUSDT',
      side: Math.random() > 0.5 ? 'bid' : 'ask',
      price: randomFloat(20000, 70000),
      quantity: randomFloat(0.0001, 2),
      ts: Date.now(),
    } satisfies OfferMessage);
    ws.send(JSON.stringify(offer));
  }
}

const sleeps = [1, 2, 3, 5, 8, 13, 21, 34, 55]

async function run() {
  let sleepInterval: number | undefined = 0;

  while ((sleepInterval = sleeps.unshift())) {
    await sleep(sleepInterval * 1000);

    try {
      // const ws = new WebSocket(wsEndpoint);
      // ws.on('open', () => {
      //   console.log('WS connected');
      //   startWsBurst(ws);
      //   setInterval(() => startWsBurst(ws), 2000);
      // });
      // ws.on('message', (data: Buffer) => {
      //   try {
      //     const json = JSON.parse(data.toString());
      //     if (!json.ok) console.error('WS error', json);
      //   } catch { }
      // });

      // ws.on('error', (...args) => {
      //   console.error('oops', ...args)
      // });

      await sleep(1000)
      await sendOrder()
    } catch (err) {
      console.log(`Failed to send order, slept ${sleepInterval}000ms`, err);
    }
  }
}


run().catch((err) => {
  console.error(err);
  process.exit(1);
});


