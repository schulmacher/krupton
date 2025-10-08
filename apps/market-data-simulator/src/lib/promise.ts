export type PromiseLock = {
  acquire: () => Promise<void>;
  release: () => void;
  lock: () => Promise<void>;
};

export function createPromiseLock(): PromiseLock {
  let currentLock: Promise<void> = Promise.resolve();
  let releaseFn: (() => void) | null = null;

  function acquire(): Promise<void> {
    return currentLock;
  }

  function release(): void {
    if (releaseFn) {
      releaseFn();
      releaseFn = null;
    }
    currentLock = Promise.resolve();
  }

  function lock(): Promise<void> {
    const newLock = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    currentLock = newLock;
    return newLock;
  }

  return {
    acquire,
    release,
    lock,
  };
}