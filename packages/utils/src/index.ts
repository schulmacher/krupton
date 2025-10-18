export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tryHard<T>(
  fn: (attempt: number) => Promise<T>,
  onRetryAttempt: (error: unknown, attempt: number) => number | null | Promise<number | null>,
): Promise<T> {
  let attemptCount = 0;

  while (true) {
    try {
      return await fn(attemptCount);
    } catch (error) {
      attemptCount++;
      const waitMs = await onRetryAttempt(error, attemptCount);

      if (waitMs === null) {
        throw error;
      }

      await sleep(waitMs);
    }
  }
}

export function createTryhardExponentialBackoff(options: {
  onRetryAttempt: (error: unknown, attempt: number) => void | Promise<void>;
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  maxAttempts?: number;
}): (error: unknown, attemptCount: number) => Promise<number> {
  const { onRetryAttempt, initialDelayMs = 1000, maxDelayMs = 60000, multiplier = 2 } = options;

  return async (error: unknown, attemptCount: number): Promise<number> => {
    if (options?.maxAttempts && attemptCount >= options.maxAttempts) {
      throw error;
    }

    await onRetryAttempt(error, attemptCount);

    const delay = Math.min(initialDelayMs * Math.pow(multiplier, attemptCount - 1), maxDelayMs);

    return delay;
  };
}

export function arrayToMultiMap<T>(array: T[], keyFn: (item: T) => string): Map<string, T[]>;
export function arrayToMultiMap<T, V>(
  array: T[],
  keyFn: (item: T) => string,
  valueFn: (item: T) => V,
): Map<string, V[]>;
export function arrayToMultiMap<T, V = T>(
  array: T[],
  keyFn: (item: T) => string,
  valueFn?: (item: T) => V,
): Map<string, V[]> {
  const map = new Map<string, V[]>();

  for (const item of array) {
    const key = keyFn(item);
    const value = valueFn ? valueFn(item) : (item as unknown as V);

    const existing = map.get(key);
    if (existing) {
      existing.push(value);
    } else {
      map.set(key, [value]);
    }
  }

  return map;
}

export function notNil<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function stringifyJSONSafe(value: unknown): unknown | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.stringify(value as any);
  } catch {
    return;
  }
}