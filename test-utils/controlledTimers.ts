import { setSystemTime, spyOn } from "bun:test";

/** Bun 1.2 has no timer advancement API; control only the APIs these tests use. */
export function controlledTimers(start = Date.parse("2026-01-01T00:00:00Z")) {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = new Map<unknown, { at: number; run: () => void }>();
  let now = start;
  setSystemTime(now);
  function schedule<T extends unknown[]>(
    callback: (...args: T) => void,
    delay?: number,
    ...args: T
  ): ReturnType<typeof setTimeout>;
  function schedule(
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ): number;
  function schedule(
    callback: TimerHandler,
    delay = 0,
    ...args: unknown[]
  ): ReturnType<typeof setTimeout> | number {
    if (typeof callback !== "function")
      throw new TypeError("Test timers require a callback");
    const handle = nativeSetTimeout(() => {}, 2_147_483_647);
    nativeClearTimeout(handle);
    timers.set(handle, {
      at: now + Math.max(0, Number(delay)),
      run: () => callback(...args),
    });
    return handle;
  }
  const timeout = spyOn(globalThis, "setTimeout").mockImplementation(
    Object.assign(schedule, { __promisify__: nativeSetTimeout.__promisify__ }),
  );
  const clear = spyOn(globalThis, "clearTimeout").mockImplementation(
    (handle) => {
      if (handle !== undefined && timers.delete(handle)) return;
      if (handle != null) nativeClearTimeout(Number(handle));
    },
  );
  const flush = async () => {
    // Async SDK and command chains may schedule more microtasks.
    for (let turn = 0; turn < 50; turn++) await Promise.resolve();
  };
  return {
    flush,
    async advance(ms: number) {
      await flush();
      const target = now + ms;
      for (;;) {
        const next = [...timers]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        setSystemTime(now);
        next[1].run();
        await flush();
      }
      now = target;
      setSystemTime(now);
      await flush();
    },
    restore() {
      timers.clear();
      timeout.mockRestore();
      clear.mockRestore();
      setSystemTime();
    },
  };
}
