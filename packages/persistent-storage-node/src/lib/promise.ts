export type PromiseLock<Result> = {
  waitForRelease: () => Promise<Result>;
  release: (result: Result) => Promise<void>;
  lock: () => Promise<Result>;
};

export function createPromiseLock<Result>(): PromiseLock<Result> {
  let currentLock: Promise<Result> = Promise.resolve(null as Result);
  let resolveFn: ((result: Result) => void) | null = null;

  function waitForRelease(): Promise<Result> {
    return currentLock.then((v) => {
      return v;
    });
  }

  async function release(result: Result): Promise<void> {
    if (resolveFn) {
      resolveFn(result);
      resolveFn = null;
    }
    currentLock = Promise.resolve(null as Result);
  }

  function lock(): Promise<Result> {
    currentLock = new Promise<Result>((resolve) => {
      resolveFn = resolve;
    });
    return currentLock;
  }

  return {
    waitForRelease,
    release,
    lock,
  };
}
