import Fastify from 'fastify';
import { WebSocketServer } from 'ws';
import {
  orderRequestSchema,
  orderResponseSchema,
  wsMessageSchema,
} from '@krupton/api-interface';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ ok: true }));

fastify.post('/orders', async (request, reply) => {
  try {
    const parsed = orderRequestSchema.parse(request.body);
    const response = orderResponseSchema.parse({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'accepted',
    });
    fastify.log.info(`Order received: ${parsed.symbol} ${parsed.side} ${parsed.quantity}@${parsed.price}`);
    return response;
  } catch {
    reply.code(400);
    return { error: 'Invalid order payload' };
  }
});

const start = async () => {
  const address = await fastify.listen({ port: 3000, host: '0.0.0.0' });
  fastify.log.info(`HTTP listening at ${address}`);

  const wss = new WebSocketServer({ noServer: true });

  fastify.server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const json = JSON.parse(data.toString());
        const msg = wsMessageSchema.parse(json);
        ws.send(JSON.stringify({ ok: true, type: msg.type }));
      } catch {
        ws.send(JSON.stringify({ ok: false, error: 'Invalid WS payload' }));
      }
    });
  });
};

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});


