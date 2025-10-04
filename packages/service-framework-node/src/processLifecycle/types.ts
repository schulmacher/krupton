import type { DiagnosticContext } from '../diagnostics/types.js';

export type ShutdownCallback = () => Promise<void> | void;

export type RejectionHandler = (
  reason: unknown,
  promise: Promise<unknown>,
) => void;

export type ExceptionHandler = (error: Error) => void;

export type WarningHandler = (warning: Error) => void;

export interface ShutdownConfiguration {
  callbackTimeout: number;
  totalTimeout: number;
}

export interface ProcessLifecycleConfig {
  diagnosticContext: DiagnosticContext;
  shutdownConfiguration?: ShutdownConfiguration;
}

export interface ProcessLifecycleContext {
  onShutdown(callback: ShutdownCallback): void;
  start(): void;
  shutdown(): Promise<void>;
  isShuttingDown(): boolean;
}

