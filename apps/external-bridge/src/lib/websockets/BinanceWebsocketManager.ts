import {
  createWSConsumer,
  createWSHandlers,
  StreamHandlersWithDefinitions,
  StreamSubscriptions,
  WebSocketConsumer,
  WebSocketStreamDefinition,
  WebSocketValidationError,
} from '@krupton/api-client-ws-node';
import { BinanceWS } from '@krupton/api-interface';
import { WebsocketServiceContext } from '../../process/websocketProcess/context';
import { createPromiseLock, PromiseLock } from '../promise';

const CommonDefinition = {
  commonResponseStream: BinanceWS.CommonResponseStream,
};

function wrapHandlersWithMetrics<TDefinitions extends Record<string, WebSocketStreamDefinition>>(
  serviceContext: WebsocketServiceContext,
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

export class BinanceWebsocketManager<
  TDefinitions extends Record<string, WebSocketStreamDefinition>,
> {
  #serviceContext: WebsocketServiceContext;
  #consumer: WebSocketConsumer;
  #subscriptions: StreamSubscriptions<TDefinitions>;
  #pendingRequests: Map<number, PromiseLock<BinanceWS.CommonResponseStream>> = new Map();
  #requestIdCounter: number = 0;

  // Binance requires a new connection every 24 hours
  #reconnectionTimer: NodeJS.Timeout | null = null;
  #isReconnecting: boolean = false;
  #connectionStartTime: number | null = null;
  #uptimeUpdateInterval: NodeJS.Timeout | null = null;

  constructor(
    serviceContext: WebsocketServiceContext,
    handlers: StreamHandlersWithDefinitions<TDefinitions>,
    subscriptions: StreamSubscriptions<TDefinitions>,
  ) {
    const { envContext, metricsContext } = serviceContext;
    const platform = envContext.config.PLATFORM;

    this.#serviceContext = serviceContext;
    this.#subscriptions = subscriptions;

    const wrappedHandlers = wrapHandlersWithMetrics(serviceContext, handlers, platform);

    this.#consumer = createWSConsumer(
      {
        ...wrappedHandlers,
        ...createWSHandlers(CommonDefinition, {
          commonResponseStream: async (data) => {
            const pending = this.#pendingRequests.get(data.id);

            if (!pending) {
              this.#serviceContext.diagnosticContext.logger.warn(
                'Received response for unknown request',
                {
                  response: data,
                },
              );

              return;
            }

            await pending.release(data);
          },
        }),
      },
      {
        url: envContext.config.API_BASE_URL,
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
              `WebSocket validation error for stream "${error.streamType}"`,
              error.getLogData(),
            );
          } else {
            serviceContext.diagnosticContext.logger.error(
              `WebSocket error: ${error.message}`,
              // TODO change diagnostic logger to accept unknown/error
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              error as any,
            );
          }
        },
        onOpen: () => {
          metricsContext.metrics.connectionStatus.set({ platform }, 1);
          this.#connectionStartTime = Date.now();
          this.#startUptimeTracking();
          serviceContext.diagnosticContext.logger.info('WebSocket opened');
        },
        onReconnect: (attempt) => {
          metricsContext.metrics.reconnectionAttempts.inc({ platform });
          serviceContext.diagnosticContext.logger.info(`WebSocket reconnected: attempt ${attempt}`);
        },
      },
    );
  }

  #getNextRequestId(): number {
    return ++this.#requestIdCounter;
  }

  #getSubscriptionParams() {
    return {
      method: 'SUBSCRIBE',
      params: Object.values(this.#subscriptions).flat(),
      id: this.#getNextRequestId(),
    } satisfies BinanceWS.SubscribeRequest;
  }

  #getUnsubscribeParams() {
    return {
      method: 'UNSUBSCRIBE',
      params: Object.values(this.#subscriptions).flat(),
      id: this.#requestIdCounter,
    } satisfies BinanceWS.UnsubscribeRequest;
  }

  async connect() {
    const { diagnosticContext, metricsContext, envContext } = this.#serviceContext;
    const platform = envContext.config.PLATFORM;

    // Connect to the WebSocket
    this.#consumer.connect();

    // Wait for connection to be established with timeout
    await Promise.race([this.#waitForConnection(), this.#connectionTimeout(10_000)]);

    // Subscribe to streams and wait for confirmation
    const subscriptionRequest = this.#getSubscriptionParams();

    diagnosticContext.logger.info('BinanceWebsocketManager subscribing to streams', {
      symbols: this.#subscriptions,
      streams: subscriptionRequest.params,
    });

    const response = await this.#sendRequestAndWaitForResponse(subscriptionRequest, 5_000);

    // Update active subscriptions metric
    const totalSubscriptions = subscriptionRequest.params.length;
    metricsContext.metrics.activeSubscriptions.set({ platform }, totalSubscriptions);

    diagnosticContext.logger.info('BinanceWebsocketManager connected and subscribed', {
      symbols: this.#subscriptions,
      streams: subscriptionRequest.params,
      responseId: response.id,
    });

    // Schedule reconnection before 24-hour limit
    this.#scheduleReconnection();
  }

  async unsubscribe() {
    const { diagnosticContext } = this.#serviceContext;

    const unsubscribeRequest = this.#getUnsubscribeParams();
    const response = await this.#sendRequestAndWaitForResponse(unsubscribeRequest, 5_000);

    diagnosticContext.logger.info('BinanceWebsocketManager unsubscribed from all streams', {
      symbols: this.#subscriptions,
      streams: unsubscribeRequest.params,
      responseId: response.id,
    });
  }

  async disconnect() {
    const { diagnosticContext, metricsContext, envContext } = this.#serviceContext;
    const platform = envContext.config.PLATFORM;

    this.#clearReconnectionTimer();
    this.#stopUptimeTracking();
    this.#consumer.disconnect();

    // Reset metrics
    metricsContext.metrics.connectionStatus.set({ platform }, 0);
    metricsContext.metrics.activeSubscriptions.set({ platform }, 0);

    diagnosticContext.logger.info('BinanceWebsocketManager disconnected');
  }

  async #waitForConnection(): Promise<void> {
    while (!this.#consumer.isConnected()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async #connectionTimeout(ms: number): Promise<void> {
    await new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`WebSocket connection timeout after ${ms}ms`));
      }, ms);
    });
  }

  async #sendRequestAndWaitForResponse(
    request:
      | BinanceWS.SubscribeRequest
      | BinanceWS.UnsubscribeRequest
      | BinanceWS.ListSubscriptionsRequest,
    timeoutMs: number,
  ): Promise<BinanceWS.CommonResponseStream> {
    const lock = createPromiseLock<BinanceWS.CommonResponseStream>();

    lock.lock();

    this.#pendingRequests.set(request.id, lock);

    try {
      this.#consumer.send(JSON.stringify(request));
    } catch (error) {
      this.#pendingRequests.delete(request.id);
      throw error;
    }

    const response = await Promise.race([
      lock.waitForRelease(),
      new Promise<BinanceWS.CommonResponseStream>((_, reject) =>
        setTimeout(() => {
          reject(new Error(`Request ${request.id} timed out after ${timeoutMs}ms`));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.#pendingRequests.get(request.id)?.release(void 0 as any);
          this.#pendingRequests.delete(request.id);
        }, timeoutMs),
      ),
    ]);

    if ('error' in response) {
      throw new Error(`Failed to subscribe to streams: ${JSON.stringify(response.error)}`);
    }

    return response;
  }

  #scheduleReconnection() {
    const { diagnosticContext } = this.#serviceContext;
    const TWENTY_THREE_HOURS_MS = 23 * 60 * 60 * 1000;

    this.#clearReconnectionTimer();

    this.#reconnectionTimer = setTimeout(() => {
      diagnosticContext.logger.info(
        'BinanceWebsocketManager initiating scheduled reconnection after 23 hours',
      );

      this.#performReconnection().catch((error) => {
        diagnosticContext.logger.error(
          'BinanceWebsocketManager failed to reconnect',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error as any,
        );
      });
    }, TWENTY_THREE_HOURS_MS);

    diagnosticContext.logger.info('BinanceWebsocketManager scheduled reconnection in 23 hours');
  }

  #clearReconnectionTimer() {
    if (this.#reconnectionTimer) {
      clearTimeout(this.#reconnectionTimer);
      this.#reconnectionTimer = null;
    }
  }

  async #performReconnection() {
    const { diagnosticContext } = this.#serviceContext;

    if (this.#isReconnecting) {
      diagnosticContext.logger.warn('BinanceWebsocketManager reconnection already in progress');
      return;
    }

    this.#isReconnecting = true;

    try {
      diagnosticContext.logger.info('BinanceWebsocketManager disconnecting');
      await this.disconnect();

      diagnosticContext.logger.info('BinanceWebsocketManager reconnecting');
      await this.connect();

      diagnosticContext.logger.info('BinanceWebsocketManager reconnection completed successfully');
    } catch (error) {
      diagnosticContext.logger.error(
        'BinanceWebsocketManager reconnection failed',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error as any,
      );
      throw error;
    } finally {
      this.#isReconnecting = false;
    }
  }

  #startUptimeTracking() {
    const { metricsContext, envContext } = this.#serviceContext;
    const platform = envContext.config.PLATFORM;

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
