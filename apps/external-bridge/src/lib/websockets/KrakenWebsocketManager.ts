import {
  createWSConsumer,
  createWSHandlers,
  StreamHandlersWithDefinitions,
  WebSocketConsumer,
  WebSocketStreamDefinition,
  WebSocketValidationError,
} from '@krupton/api-client-ws-node';
import { KrakenWS } from '@krupton/api-interface';
import { KrakenWebSocketServiceContext } from '../../process/websocketProcess/krakenWebsocketContext.js';
import { createPromiseLock, PromiseLock } from '../promise.js';

const CommonDefinition = {
  subscriptionStatusStream: KrakenWS.SubscriptionStatusStream,
  heartbeatStream: KrakenWS.HeartbeatStream,
  statusStream: KrakenWS.StatusStream,
};

interface SubscriptionRequest {
  channel: string;
  symbols: string[];
  depth?: number;
  snapshot?: boolean;
}

function wrapHandlersWithMetrics<TDefinitions extends Record<string, WebSocketStreamDefinition>>(
  serviceContext: KrakenWebSocketServiceContext,
  handlers: StreamHandlersWithDefinitions<TDefinitions>,
  platform: string,
): StreamHandlersWithDefinitions<TDefinitions> {
  const { metricsContext } = serviceContext;
  const wrappedHandlers = {} as StreamHandlersWithDefinitions<TDefinitions>;

  for (const [streamKey, handlerWithDef] of Object.entries(handlers)) {
    const key = streamKey as keyof TDefinitions;
    wrappedHandlers[key] = {
      definition: handlerWithDef.definition,
      handler: async (data, raw) => {
        const startTime = Date.now();
        try {
          await handlerWithDef.handler(data, raw);
          metricsContext.metrics.messagesReceived.inc({
            platform,
            stream_type: streamKey,
            status: 'success',
          });
          metricsContext.metrics.lastMessageTimestamp.set(
            { platform, stream_type: streamKey },
            Date.now() / 1000,
          );
        } catch (error) {
          metricsContext.metrics.messagesReceived.inc({
            platform,
            stream_type: streamKey,
            status: 'error',
          });
          throw error;
        } finally {
          const duration = (performance.now() - startTime) / 1000;
          metricsContext.metrics.messageProcessingDuration.observe(
            { platform, stream_type: streamKey },
            duration,
          );
        }
      },
    } as StreamHandlersWithDefinitions<TDefinitions>[keyof TDefinitions];
  }

  return wrappedHandlers;
}

export class KrakenWebsocketManager<
  TDefinitions extends Record<string, WebSocketStreamDefinition>,
> {
  #serviceContext: KrakenWebSocketServiceContext;
  #consumer: WebSocketConsumer;
  #subscriptionRequests: SubscriptionRequest[];
  #pendingSubscriptions: Map<string, PromiseLock<KrakenWS.SubscriptionStatusStream>> = new Map();
  #expectedAcknowledgments: Map<string, number> = new Map();

  #reconnectionTimer: NodeJS.Timeout | null = null;
  #isReconnecting: boolean = false;
  #connectionStartTime: number | null = null;
  #uptimeUpdateInterval: NodeJS.Timeout | null = null;

  constructor(
    serviceContext: KrakenWebSocketServiceContext,
    handlers: StreamHandlersWithDefinitions<TDefinitions>,
    subscriptionRequests: SubscriptionRequest[],
  ) {
    const { envContext, metricsContext } = serviceContext;
    const platform = 'kraken';

    this.#serviceContext = serviceContext;
    this.#subscriptionRequests = subscriptionRequests;

    const wrappedHandlers = wrapHandlersWithMetrics(serviceContext, handlers, platform);

    this.#consumer = createWSConsumer(
      {
        ...wrappedHandlers,
        ...createWSHandlers(CommonDefinition, {
          heartbeatStream: () => {
            // no-op
          },
          statusStream: (data) => {
            this.#serviceContext.diagnosticContext.logger.info('Kraken WebSocket status update', {
              system: data.data[0].system,
              api_version: data.data[0].api_version,
              version: data.data[0].version,
            });
          },
          subscriptionStatusStream: async (data) => {
            if ('result' in data && data.result) {
              const key = `${data.method}-${data.result.channel}`;
              const pending = this.#pendingSubscriptions.get(key);

              if (!pending) {
                this.#serviceContext.diagnosticContext.logger.warn(
                  'Received subscription status for unknown request',
                  {
                    response: data,
                  },
                );
                return;
              }

              const expected = this.#expectedAcknowledgments.get(key) || 0;
              const newCount = expected - 1;

              if (newCount <= 0) {
                this.#expectedAcknowledgments.delete(key);
                await pending.release(data);
              } else {
                this.#expectedAcknowledgments.set(key, newCount);
              }
            } else if ('error' in data) {
              // Handle error response
              this.#serviceContext.diagnosticContext.logger.error(
                new Error('Subscription error received'),
                data,
              );
            }
          },
        }),
      },
      {
        url: envContext.config.WSS_BASE_URL,
        validation: true,
      },
      {
        onClose: (code, reason) => {
          metricsContext.metrics.connectionStatus.set({ platform }, 0);
          this.#stopUptimeTracking();
          serviceContext.diagnosticContext.logger.info(`WebSocket closed: ${code} ${reason}`);
        },
        onError: (error) => {
          if (error instanceof WebSocketValidationError) {
            metricsContext.metrics.validationErrors.inc({
              platform,
              stream_type: error.streamType || 'unknown',
            });
            serviceContext.diagnosticContext.logger.error(
              error,
              `WebSocket validation error for stream "${error.streamType}"`,
            );
          } else {
            serviceContext.diagnosticContext.logger.error(
              error,
              `WebSocket error: ${error.message}`,
            );
          }
        },
        onOpen: () => {
          metricsContext.metrics.connectionStatus.set({ platform }, 1);
          this.#connectionStartTime = Date.now();
          this.#startUptimeTracking();
          serviceContext.diagnosticContext.logger.info('WebSocket opened');
          void this.#subscribe();
        },
        onReconnect: (attempt) => {
          metricsContext.metrics.reconnectionAttempts.inc({ platform });
          serviceContext.diagnosticContext.logger.info(`WebSocket reconnected: attempt ${attempt}`);
        },
      },
    );
  }

  #getSubscribeRequest(request: SubscriptionRequest): KrakenWS.SubscribeRequest {
    const params: KrakenWS.SubscribeRequest['params'] = {
      channel: request.channel,
      symbol: request.symbols,
    };

    if (request.snapshot !== undefined) {
      params.snapshot = request.snapshot;
    }

    if (request.depth !== undefined) {
      params.depth = request.depth;
    }

    return {
      method: 'subscribe',
      params,
    };
  }

  #getUnsubscribeRequest(request: SubscriptionRequest): KrakenWS.UnsubscribeRequest {
    return {
      method: 'unsubscribe',
      params: {
        channel: request.channel,
        symbol: request.symbols,
      },
    };
  }

  async connect() {
    // Connect to the WebSocket
    this.#consumer.connect();

    // Wait for connection to be established with timeout
    await this.#waitForConnection();

    // Kraken doesn't require periodic reconnection like Binance
  }

  async #subscribe() {
    const { diagnosticContext, metricsContext } = this.#serviceContext;
    const platform = 'kraken';

    // Subscribe to each channel
    const subscriptionPromises = this.#subscriptionRequests.map(async (request) => {
      const subscribeRequest = this.#getSubscribeRequest(request);

      diagnosticContext.logger.info('KrakenWebsocketManager subscribing to channel', {
        channel: request.channel,
        symbols: request.symbols,
      });

      const response = await this.#sendRequestAndWaitForResponse(
        subscribeRequest,
        request.symbols.length,
        5_000,
      );

      diagnosticContext.logger.info('KrakenWebsocketManager subscribed to channel', {
        channel: request.channel,
        symbols: request.symbols,
        success: response.success,
      });

      return response;
    });

    await Promise.all(subscriptionPromises);

    // Update active subscriptions metric
    const totalSymbols = this.#subscriptionRequests.reduce(
      (sum, req) => sum + req.symbols.length,
      0,
    );
    metricsContext.metrics.activeSubscriptions.set({ platform }, totalSymbols);

    diagnosticContext.logger.info(
      'KrakenWebsocketManager connected and subscribed to all channels',
    );
  }

  async unsubscribe() {
    const { diagnosticContext } = this.#serviceContext;

    const unsubscribePromises = this.#subscriptionRequests.map(async (request) => {
      const unsubscribeRequest = this.#getUnsubscribeRequest(request);
      const response = await this.#sendRequestAndWaitForResponse(
        unsubscribeRequest,
        request.symbols.length,
        5_000,
      );

      diagnosticContext.logger.info('KrakenWebsocketManager unsubscribed from channel', {
        channel: request.channel,
        symbols: request.symbols,
        success: response.success,
      });

      return response;
    });

    await Promise.all(unsubscribePromises);

    diagnosticContext.logger.info('KrakenWebsocketManager unsubscribed from all channels');
  }

  async disconnect() {
    const { diagnosticContext, metricsContext } = this.#serviceContext;
    const platform = 'kraken';

    this.#stopUptimeTracking();
    this.#consumer.disconnect();

    // Reset metrics
    metricsContext.metrics.connectionStatus.set({ platform }, 0);
    metricsContext.metrics.activeSubscriptions.set({ platform }, 0);

    diagnosticContext.logger.info('KrakenWebsocketManager disconnected');
  }

  async #waitForConnection(): Promise<void> {
    while (!this.#consumer.isConnected()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async #sendRequestAndWaitForResponse(
    request: KrakenWS.SubscribeRequest | KrakenWS.UnsubscribeRequest,
    expectedAcknowledgments: number,
    timeoutMs: number,
  ): Promise<KrakenWS.SubscriptionStatusStream> {
    const key = `${request.method}-${request.params.channel}`;
    const lock = createPromiseLock<KrakenWS.SubscriptionStatusStream>();

    lock.lock();

    this.#pendingSubscriptions.set(key, lock);
    this.#expectedAcknowledgments.set(key, expectedAcknowledgments);

    try {
      this.#consumer.send(JSON.stringify(request));
    } catch (error) {
      this.#pendingSubscriptions.delete(key);
      this.#expectedAcknowledgments.delete(key);
      throw error;
    }

    const response = await Promise.race([
      lock.waitForRelease(),
      new Promise<KrakenWS.SubscriptionStatusStream>((_, reject) =>
        setTimeout(() => {
          reject(new Error(`Request for ${key} timed out after ${timeoutMs}ms`));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.#pendingSubscriptions.get(key)?.release(void 0 as any);
          this.#pendingSubscriptions.delete(key);
          this.#expectedAcknowledgments.delete(key);
        }, timeoutMs),
      ),
    ]).catch((error) => {
      this.#serviceContext.diagnosticContext.logger.error(error, {
        request,
        expectedAcknowledgments,
        timeoutMs,
      });
      this.#serviceContext.processContext.restart();
      throw error;
    });

    if ('error' in response) {
      throw new Error(`Failed to ${request.method} to channel: ${response.error}`);
    }

    return response;
  }

  #startUptimeTracking() {
    const { metricsContext } = this.#serviceContext;
    const platform = 'kraken';

    this.#stopUptimeTracking();

    // Update uptime every 10 seconds
    this.#uptimeUpdateInterval = setInterval(() => {
      if (this.#connectionStartTime !== null) {
        const uptimeSeconds = (Date.now() - this.#connectionStartTime) / 1000;
        metricsContext.metrics.connectionUptime.set({ platform }, uptimeSeconds);
      }
    }, 10_000);
  }

  #stopUptimeTracking() {
    if (this.#uptimeUpdateInterval) {
      clearInterval(this.#uptimeUpdateInterval);
      this.#uptimeUpdateInterval = null;
    }
  }
}
