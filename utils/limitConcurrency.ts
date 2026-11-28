type Limited = <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

/**
 * Runs at most `max` tasks at once, in the order they were given. A task
 * whose signal aborts while it waits is dropped without ever starting.
 */
export function createLimiter(max: number): Limited {
  let running = 0;
  const waiting: Array<() => void> = [];

  const next = () => {
    if (running >= max) return;
    waiting.shift()?.();
  };

  return <T>(task: () => Promise<T>, signal?: AbortSignal) =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        signal?.removeEventListener("abort", drop);
        running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      };
      const drop = () => {
        const index = waiting.indexOf(start);
        if (index !== -1) waiting.splice(index, 1);
        reject(signal?.reason);
      };

      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", drop, { once: true });
      waiting.push(start);
      next();
    });
}
