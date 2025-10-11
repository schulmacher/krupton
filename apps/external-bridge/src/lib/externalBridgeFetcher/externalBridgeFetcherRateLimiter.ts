import type { SF } from '@krupton/service-framework-node';

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

export interface ExternalBridgeFetcherRateLimiter {
  recordRequest: () => void;
  throttle: () => Promise<void>;
  onError: () => void;
  resetBackoff: () => void;
}

export function createExternalBridgeFetcherRateLimiter(
  diagnosticContext: SF.DiagnosticContext,
  config: RateLimiterConfig,
): ExternalBridgeFetcherRateLimiter {
  const { maxRequests, windowMs, backoffBaseMs = 1000, backoffMaxMs = 60000 } = config;

  const defaultWaitMs = windowMs / maxRequests;
  let windowStartMs = Date.now();
  let requestCount = 0;

  let consecutiveErrors = 0;
  let backoffUntilMs = 0;

  const isWindowExpired = (now: number): boolean => {
    return now - windowStartMs >= windowMs;
  };

  const resetWindow = (now: number): void => {
    windowStartMs = now;
    requestCount = 0;
  };

  const calculateBackoffMs = (): number => {
    return Math.min(backoffMaxMs, backoffBaseMs * Math.pow(2, consecutiveErrors));
  };

  const calculateWaitTime = (now: number): number => {
    const backoffWaitTime = Math.max(0, backoffUntilMs - now);
    if (backoffWaitTime > 0) {
      return backoffWaitTime;
    }

    if (requestCount >= maxRequests) {
      const windowEndMs = windowStartMs + windowMs;
      return Math.max(0, windowEndMs - now);
    }

    const elapsedMs = now - windowStartMs;
    const expectedTimeForRequestCount = requestCount * defaultWaitMs;
    const timeAheadOfSchedule = expectedTimeForRequestCount - elapsedMs;

    return Math.max(0, timeAheadOfSchedule);
  };

  const recordRequest = (): void => {
    const now = Date.now();

    if (isWindowExpired(now)) {
      resetWindow(now);
    }

    requestCount++;

    consecutiveErrors = 0;
    backoffUntilMs = 0;
  };

  const throttle = async (): Promise<void> => {
    const now = Date.now();
    const waitTime = calculateWaitTime(now);

    if (waitTime > 0) {
      diagnosticContext.logger.debug(`Waiting ${waitTime}ms before next request`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    if (isWindowExpired(now)) {
      resetWindow(now);
    }
  };

  const setLimitReached = (): void => {
    const now = Date.now();
    consecutiveErrors++;
    const backoffDelayMs = calculateBackoffMs();
    backoffUntilMs = Math.max(now + backoffDelayMs, backoffUntilMs);

    diagnosticContext.logger.warn('Rate limit reached, backing off', {
      consecutiveErrors,
      backoffDelayMs,
      backoffUntilMs,
      willBackoffFor: `${backoffDelayMs / 1000}s`,
    });
  };

  const resetBackoff = (): void => {
    consecutiveErrors = 0;
    backoffUntilMs = 0;
  };

  return {
    recordRequest,
    throttle,
    onError: setLimitReached,
    resetBackoff,
  };
}
