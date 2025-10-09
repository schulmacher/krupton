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

export class BinanceWebsocketManager<
  TDefinitions extends Record<string, WebSocketStreamDefinition>,
  THandlers extends StreamHandlersWithDefinitions<TDefinitions>,
  TSubscriptions extends StreamSubscriptions<TDefinitions>,
> {
  #serviceContext: WebsocketServiceContext;
  #consumer: WebSocketConsumer;
  #subscriptions: TSubscriptions;
  #pendingRequests: Map<number, PromiseLock<BinanceWS.CommonResponseStream>> = new Map();
  #requestIdCounter: number = 0;

  constructor(
    serviceContext: WebsocketServiceContext,
    handlers: THandlers,
    subscriptions: TSubscriptions,
  ) {
    const { envContext } = serviceContext;

    this.#serviceContext = serviceContext;
    this.#subscriptions = subscriptions;
    this.#consumer = createWSConsumer(
      {
        ...handlers,
        ...createWSHandlers(CommonDefinition, {
          commonResponseStream: (data) => {
            this.handleCommonResponse(data);
          },
        }),
      },
      {
        url: envContext.config.API_BASE_URL,
        validation: true,
      },
      {
        onClose: (code, reason) => {
          console.log(`WebSocket closed: ${code} ${reason}`);
        },
        onError: (error) => {
          if (error instanceof WebSocketValidationError) {
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
          console.log('WebSocket opened');
        },
        onReconnect: (attempt) => {
          console.log(`WebSocket reconnected: ${attempt}`);
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
    await Promise.race([this.#waitForConnection(), this.#connectionTimeout(10_000)]);

    // Subscribe to streams and wait for confirmation
    const subscriptionRequest = this.#getSubscriptionParams();

    diagnosticContext.logger.info('BinanceWebsocketManager subscribing to streams', {
      symbols: this.#subscriptions,
      streams: subscriptionRequest.params,
    });

    const response = await this.#sendRequestAndWaitForResponse(subscriptionRequest, 5_000);

    diagnosticContext.logger.info('BinanceWebsocketManager connected and subscribed', {
      symbols: this.#subscriptions,
      streams: subscriptionRequest.params,
      responseId: response.id,
    });
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
    const { diagnosticContext } = this.#serviceContext;

    this.#consumer.disconnect();

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

  async handleCommonResponse(response: BinanceWS.CommonResponseStream) {
    const pending = this.#pendingRequests.get(response.id);

    if (!pending) {
      this.#serviceContext.diagnosticContext.logger.warn('Received response for unknown request', {
        response,
      });

      return;
    }

    await pending.release(response);
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
}
