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
import { BinanceWebSocketServiceContext } from '../../process/websocketProcess/binanceWebsocketContext';
import { createPromiseLock, PromiseLock } from '../promise';

const CommonDefinition = {
  commonResponseStream: BinanceWS.CommonResponseStream,
};

function wrapHandlersWithMetrics<TDefinitions extends Record<string, WebSocketStreamDefinition>>(
  serviceContext: BinanceWebSocketServiceContext,
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
  #serviceContext: BinanceWebSocketServiceContext;
  #consumer: WebSocketConsumer;
  #subscriptions: StreamSubscriptions<TDefinitions>;
  #pendingRequests: Map<number, PromiseLock<BinanceWS.CommonResponseStream>> = new Map();
  #requestIdCounter: number = 0;

  // Binance requires a new connection every 24 hours
  #restartTimer: NodeJS.Timeout | null = null;
  #connectionStartTime: number | null = null;
  #uptimeUpdateInterval: NodeJS.Timeout | null = null;

  constructor(
    serviceContext: BinanceWebSocketServiceContext,
    handlers: StreamHandlersWithDefinitions<TDefinitions>,
    subscriptions: StreamSubscriptions<TDefinitions>,
  ) {
    const { envContext, metricsContext } = serviceContext;
    const platform = 'binance';

    this.#serviceContext = serviceContext;
    this.#subscriptions = subscriptions;

    const wrappedHandlers = wrapHandlersWithMetrics(serviceContext, handlers, platform);

    this.#consumer = createWSConsumer(
      {
        ...wrappedHandlers,
        ...createWSHandlers(CommonDefinition, {
          commonResponseStream: async (data) => {
            serviceContext.diagnosticContext.logger.debug(
              'commonResponseStream: received message',
              {
                responseId: data.id,
                hasError: 'error' in data,
                hasResult: 'result' in data,
                pendingRequestsCount: this.#pendingRequests.size,
                hasPendingRequest: this.#pendingRequests.has(data.id),
                data,
              },
            );

            const pending = this.#pendingRequests.get(data.id);

            if (!pending) {
              serviceContext.diagnosticContext.logger.warn(
                'Received response for unknown request',
                {
                  responseId: data.id,
                  pendingRequestIds: Array.from(this.#pendingRequests.keys()),
                  response: data,
                },
              );

              return;
            }

            serviceContext.diagnosticContext.logger.debug('commonResponseStream: releasing lock', {
              responseId: data.id,
            });

            await pending.release(data);
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
            serviceContext.diagnosticContext.logger.error(error, `WebSocket validation error`, {
              streamType: error.streamType,
            });
          } else {
            const errorMessage = error.message || String(error);
            const isIdentificationError = errorMessage.includes('Unable to identify message type');
            const isHandlerError = errorMessage.includes('No handler registered');

            serviceContext.diagnosticContext.logger.error(
              error,
              `WebSocket error: ${errorMessage}`,
              {
                errorType: error.constructor.name,
                message: errorMessage,
                isIdentificationError,
                isHandlerError,
                pendingRequestsCount: this.#pendingRequests.size,
                pendingRequestIds: Array.from(this.#pendingRequests.keys()),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fullError: error as any,
              },
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
    const { diagnosticContext } = this.#serviceContext;

    // Connect to the WebSocket
    this.#consumer.connect();

    // Wait for connection to be established with timeout
    await this.#waitForConnection();

    diagnosticContext.logger.info('BinanceWebsocketManager connected');

    // Schedule reconnection before 24-hour limit
    this.#scheduleRestart();
  }

  async #subscribe() {
    const { diagnosticContext, metricsContext } = this.#serviceContext;
    const platform = 'binance';

    const subscriptionRequest = this.#getSubscriptionParams();

    diagnosticContext.logger.info('BinanceWebsocketManager subscribing to streams', {
      symbols: this.#subscriptions,
      streams: subscriptionRequest.params,
    });

    const response = await this.sendRequestAndWaitForResponse(subscriptionRequest, 5_000);

    // Update active subscriptions metric
    const totalSubscriptions = subscriptionRequest.params.length;
    metricsContext.metrics.activeSubscriptions.set({ platform }, totalSubscriptions);

    diagnosticContext.logger.info('BinanceWebsocketManager subscribed', {
      symbols: this.#subscriptions,
      streams: subscriptionRequest.params,
      responseId: response.id,
    });

    return response;
  }

  async unsubscribe() {
    const { diagnosticContext } = this.#serviceContext;

    const unsubscribeRequest = this.#getUnsubscribeParams();
    const response = await this.sendRequestAndWaitForResponse(unsubscribeRequest, 5_000);

    diagnosticContext.logger.info('BinanceWebsocketManager unsubscribed from all streams', {
      symbols: this.#subscriptions,
      streams: unsubscribeRequest.params,
      responseId: response.id,
    });
  }

  async disconnect() {
    const { diagnosticContext, metricsContext } = this.#serviceContext;
    const platform = 'binance';

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

  async sendRequestAndWaitForResponse(
    request:
      | BinanceWS.SubscribeRequest
      | BinanceWS.UnsubscribeRequest
      | BinanceWS.ListSubscriptionsRequest,
    timeoutMs: number,
  ): Promise<BinanceWS.CommonResponseStream> {
    const { diagnosticContext } = this.#serviceContext;
    const lock = createPromiseLock<BinanceWS.CommonResponseStream>();

    diagnosticContext.logger.debug('sendRequestAndWaitForResponse: preparing request', {
      requestId: request.id,
      method: request.method,
      params: 'params' in request ? request.params : undefined,
      timeoutMs,
      isConnected: this.#consumer.isConnected(),
      pendingRequestsCount: this.#pendingRequests.size,
    });

    lock.lock();

    this.#pendingRequests.set(request.id, lock);

    try {
      const requestString = JSON.stringify(request);
      diagnosticContext.logger.debug('sendRequestAndWaitForResponse: sending request', {
        requestId: request.id,
        requestString,
      });

      this.#consumer.send(requestString);

      diagnosticContext.logger.debug(
        'sendRequestAndWaitForResponse: request sent, waiting for response',
        {
          requestId: request.id,
        },
      );
    } catch (error) {
      diagnosticContext.logger.error(
        error,
        'sendRequestAndWaitForResponse: failed to send request',
        {
          requestId: request.id,
          error,
        },
      );
      this.#pendingRequests.delete(request.id);
      throw error;
    }

    const response = await Promise.race([
      lock.waitForRelease().then((res) => {
        diagnosticContext.logger.debug('sendRequestAndWaitForResponse: received response', {
          requestId: request.id,
          hasError: 'error' in res,
          response: res,
        });
        return res;
      }),
      new Promise<BinanceWS.CommonResponseStream>((_, reject) =>
        setTimeout(() => {
          reject(new Error(`Request ${request.id} timed out after ${timeoutMs}ms`));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.#pendingRequests.get(request.id)?.release(void 0 as any);
          this.#pendingRequests.delete(request.id);
        }, timeoutMs),
      ),
    ]).catch((error) => {
      this.#serviceContext.diagnosticContext.logger.error(error, {
        request,
        timeoutMs,
      });
      this.#serviceContext.processContext.restart();
      throw error;
    });

    this.#pendingRequests.delete(request.id);

    if ('error' in response) {
      const error = new Error(`Request failed: ${JSON.stringify(response.error)}`);
      diagnosticContext.logger.error(error, {
        requestId: request.id,
        error: response.error,
      });
      throw error;
    }

    diagnosticContext.logger.debug(
      'sendRequestAndWaitForResponse: request completed successfully',
      {
        requestId: request.id,
      },
    );

    return response;
  }

  #scheduleRestart() {
    const { diagnosticContext } = this.#serviceContext;
    const TWENTY_THREE_HOURS_MS = 23 * 60 * 60 * 1000;

    this.#clearReconnectionTimer();

    this.#restartTimer = setTimeout(() => {
      diagnosticContext.logger.info(
        'BinanceWebsocketManager initiating scheduled restart after 23 hours',
      );

      this.#serviceContext.processContext.restart();
    }, TWENTY_THREE_HOURS_MS);

    diagnosticContext.logger.info('BinanceWebsocketManager scheduled restart in 23 hours');
  }

  #clearReconnectionTimer() {
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
  }

  #startUptimeTracking() {
    const { metricsContext } = this.#serviceContext;
    const platform = 'binance';

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
