import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMdsFetcherRateLimiter } from './mdsFetcherRateLimiter.js';

describe('createMdsFetcherRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recordRequest', () => {
    it('should increment request count', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      rateLimiter.recordRequest();
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      const throttlePromise = rateLimiter.throttle();
      const expectedWaitMs = (3 * 1000) / 10;
      await vi.advanceTimersByTimeAsync(expectedWaitMs);
      await throttlePromise;
    });

    it('should reset request count when window expires', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      vi.advanceTimersByTime(1000);

      rateLimiter.recordRequest();

      const throttlePromise = rateLimiter.throttle();
      const expectedWaitMs = (1 * 1000) / 10;
      await vi.advanceTimersByTimeAsync(expectedWaitMs);
      await throttlePromise;
    });
  });

  describe('throttle', () => {
    it('should not throttle on first request', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      const startTime = Date.now();
      await rateLimiter.throttle();
      const endTime = Date.now();

      expect(endTime - startTime).toBe(0);
    });

    it('should throttle to maintain even distribution', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      const expectedWaitPerRequest = 1000 / 10;

      rateLimiter.recordRequest();

      vi.advanceTimersByTime(50);

      const throttlePromise = rateLimiter.throttle();

      const expectedWait = expectedWaitPerRequest - 50;
      await vi.advanceTimersByTimeAsync(expectedWait);

      await throttlePromise;
    });

    it('should wait until window end when rate limit is hit', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest();
      }

      vi.advanceTimersByTime(500);

      const throttlePromise = rateLimiter.throttle();

      const expectedWait = 1000 - 500;
      await vi.advanceTimersByTimeAsync(expectedWait);

      await throttlePromise;
    });

    it('should not throttle if behind schedule', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      rateLimiter.recordRequest();

      vi.advanceTimersByTime(200);

      const startTime = Date.now();
      await rateLimiter.throttle();
      const endTime = Date.now();

      expect(endTime - startTime).toBe(0);
    });

    it('should reset window when expired', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest();
      }

      vi.advanceTimersByTime(1000);

      const startTime = Date.now();
      await rateLimiter.throttle();
      const endTime = Date.now();

      expect(endTime - startTime).toBe(0);
    });
  });

  describe('rate limiting scenarios', () => {
    it('should handle rapid successive requests', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 100,
        windowMs: 1000,
      });

      const expectedWaitPerRequest = 1000 / 100;

      for (let i = 0; i < 10; i++) {
        await rateLimiter.throttle();
        rateLimiter.recordRequest();
        vi.advanceTimersByTime(expectedWaitPerRequest);
      }

      expect(Date.now()).toBeGreaterThanOrEqual(10 * expectedWaitPerRequest);
    });

    it('should distribute requests evenly across window', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      const timestamps: number[] = [];

      for (let i = 0; i < 10; i++) {
        const throttlePromise = rateLimiter.throttle();
        await vi.advanceTimersByTimeAsync(0);
        await throttlePromise;

        timestamps.push(Date.now());
        rateLimiter.recordRequest();

        if (i < 9) {
          vi.advanceTimersByTime(100);
        }
      }

      const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]!);
      const expectedGap = 100;

      gaps.forEach((gap) => {
        expect(gap).toBeGreaterThanOrEqual(expectedGap);
      });
    });

    it('should handle Binance rate limit (2400 requests/minute)', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 2400,
        windowMs: 60000,
      });

      const expectedWaitPerRequest = 60000 / 2400;

      for (let i = 0; i < 100; i++) {
        await rateLimiter.throttle();
        rateLimiter.recordRequest();
        vi.advanceTimersByTime(expectedWaitPerRequest);
      }

      expect(Date.now()).toBeGreaterThanOrEqual(100 * expectedWaitPerRequest);
    });

    it('should block when max requests reached until window resets', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 3,
        windowMs: 1000,
      });

      for (let i = 0; i < 3; i++) {
        rateLimiter.recordRequest();
        vi.advanceTimersByTime(100);
      }

      const throttlePromise = rateLimiter.throttle();
      const expectedWait = 1000 - 300;
      await vi.advanceTimersByTimeAsync(expectedWait);
      await throttlePromise;

      expect(Date.now()).toBeGreaterThanOrEqual(1000);
    });

    it('should handle multiple symbols sharing same rate limiter', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest();
        vi.advanceTimersByTime(50);
      }

      const throttlePromise = rateLimiter.throttle();
      await vi.advanceTimersByTimeAsync(500);
      await throttlePromise;

      const totalTime = Date.now();
      expect(totalTime).toBeGreaterThanOrEqual(500);
    });
  });

  describe('edge cases', () => {
    it('should handle zero elapsed time', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      await rateLimiter.throttle();
      rateLimiter.recordRequest();

      const throttlePromise = rateLimiter.throttle();
      const expectedWait = 1000 / 10;
      await vi.advanceTimersByTimeAsync(expectedWait);
      await throttlePromise;

      expect(Date.now()).toBeGreaterThanOrEqual(expectedWait);
    });

    it('should handle very small window sizes', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 2,
        windowMs: 100,
      });

      await rateLimiter.throttle();
      rateLimiter.recordRequest();

      vi.advanceTimersByTime(50);

      await rateLimiter.throttle();
      rateLimiter.recordRequest();

      const throttlePromise = rateLimiter.throttle();
      await vi.advanceTimersByTimeAsync(50);
      await throttlePromise;
    });

    it('should handle very large window sizes', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 10000,
        windowMs: 3600000,
      });

      await rateLimiter.throttle();
      rateLimiter.recordRequest();

      const expectedWait = 3600000 / 10000;
      vi.advanceTimersByTime(expectedWait);

      await rateLimiter.throttle();
      rateLimiter.recordRequest();
    });

    it('should handle single request per window', async () => {
      const rateLimiter = createMdsFetcherRateLimiter({
        maxRequests: 1,
        windowMs: 1000,
      });

      await rateLimiter.throttle();
      rateLimiter.recordRequest();

      const throttlePromise = rateLimiter.throttle();
      await vi.advanceTimersByTimeAsync(1000);
      await throttlePromise;
    });
  });
});
