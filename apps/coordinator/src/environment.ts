import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';

export const coordinatorEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'coordinator' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3000 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),
  
  // ZeroMQ configuration for shard coordination
  SHARD_COORDINATOR_BIND_PORT: TB.Integer({ default: 5555 }),
  SHARD_COORDINATOR_BIND_HOST: TB.String({ default: 'tcp://0.0.0.0' }),
  
  // Heartbeat configuration (in seconds)
  HEARTBEAT_TIMEOUT_SECONDS: TB.Integer({ default: 15 }),
  INACTIVE_WORKER_TIMEOUT_SECONDS: TB.Integer({ default: 60 }),
  HEARTBEAT_CHECK_INTERVAL_SECONDS: TB.Integer({ default: 5 }),
}) satisfies SF.DefaultEnvSchema;

export type CoordinatorEnv = TB.Static<typeof coordinatorEnvSchema>;