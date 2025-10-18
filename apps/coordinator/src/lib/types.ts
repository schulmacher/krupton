export interface RegistrationMessage {
  serviceName: string;
  workerId: string;
  maxShardCount: number;
}

export interface HeartbeatMessage {
  serviceName: string;
  workerId: string;
  maxShardCount: number;
  assignedShards: number[];
}

export interface AssignmentMessage {
  assignedShards: number[];
}

export interface WorkerInfo {
  workerId: string;
  serviceName: string;
  assignedShards: number[];
  lastHeartbeat: number;
  isActive: boolean;
}

export interface ServiceConfig {
  serviceName: string;
  maxShardCount: number;
  workers: Map<string, WorkerInfo>;
}

// Discriminated union for incoming messages
export type IncomingMessage =
  | { type: 'register'; data: RegistrationMessage }
  | { type: 'heartbeat'; data: HeartbeatMessage };

export interface OutgoingMessage {
  type: 'assignment';
  data: AssignmentMessage;
}
