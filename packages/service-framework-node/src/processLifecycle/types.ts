import type { DiagnosticContext } from '../diagnostics/types.js';
import { EnvContext } from '../environment/types.js';

export type ShutdownCallback = () => Promise<void> | void;

export type RejectionHandler = (reason: unknown, promise: Promise<unknown>) => void;

export type ExceptionHandler = (error: Error) => void;

export type WarningHandler = (warning: Error) => void;

export interface ShutdownConfiguration {
  callbackTimeout: number;
  totalTimeout: number;
}

export interface ProcessLifecycleConfig {
  shutdownConfiguration?: ShutdownConfiguration;
}

export type ProcessStartFn = (
  context: ProcessLifecycleContext,
) => Promise<{ diagnosticContext: DiagnosticContext; envContext: EnvContext }>;

export interface ProcessLifecycleContext {
  onShutdown(callback: ShutdownCallback): void;
  shutdown(): Promise<void>;
  isShuttingDown(): boolean;
  restart(): Promise<void>;
}
