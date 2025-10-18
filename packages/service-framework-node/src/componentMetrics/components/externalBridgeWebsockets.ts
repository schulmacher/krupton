import type {
  MetricConfigCounter,
  MetricConfigGauge,
  MetricConfigHistogram,
} from '../../metrics/types.js';

const messagesReceived: MetricConfigCounter<'platform' | 'stream_type' | 'status'> = {
  type: 'counter',
  name: 'websocket_messages_received_total',
  help: 'Total number of WebSocket messages received',
  labelNames: ['platform', 'stream_type', 'status'] as const,
};

const messageProcessingDuration: MetricConfigHistogram<'platform' | 'stream_type'> = {
  type: 'histogram',
  name: 'websocket_message_processing_duration_seconds',
  help: 'Duration of message processing in seconds',
  labelNames: ['platform', 'stream_type'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
};

const connectionStatus: MetricConfigGauge<'platform'> = {
  type: 'gauge',
  name: 'websocket_connection_status',
  help: 'WebSocket connection status (1=connected, 0=disconnected)',
  labelNames: ['platform'] as const,
};

const reconnectionAttempts: MetricConfigCounter<'platform'> = {
  type: 'counter',
  name: 'websocket_reconnection_attempts_total',
  help: 'Total number of reconnection attempts',
  labelNames: ['platform'] as const,
};

const activeSubscriptions: MetricConfigGauge<'platform'> = {
  type: 'gauge',
  name: 'websocket_active_subscriptions',
  help: 'Number of active WebSocket subscriptions',
  labelNames: ['platform'] as const,
};

const validationErrors: MetricConfigCounter<'platform' | 'stream_type'> = {
  type: 'counter',
  name: 'websocket_validation_errors_total',
  help: 'Total number of message validation errors',
  labelNames: ['platform', 'stream_type'] as const,
};

const connectionUptime: MetricConfigGauge<'platform'> = {
  type: 'gauge',
  name: 'websocket_connection_uptime_seconds',
  help: 'WebSocket connection uptime in seconds',
  labelNames: ['platform'] as const,
};

const lastMessageTimestamp: MetricConfigGauge<'platform' | 'stream_type'> = {
  type: 'gauge',
  name: 'websocket_last_message_timestamp_seconds',
  help: 'Unix timestamp of the last received message per stream type',
  labelNames: ['platform', 'stream_type'] as const,
};

export const externalBridgeWebsocketsMetrics = {
  messagesReceived,
  messageProcessingDuration,
  connectionStatus,
  reconnectionAttempts,
  activeSubscriptions,
  validationErrors,
  connectionUptime,
  lastMessageTimestamp,
};
