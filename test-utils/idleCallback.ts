// React Native provides requestIdleCallback; Node, which runs the specs, does
// not. Specs get one built on timers, so fake timers drive it like any other
// deferred work. Loaded once for every spec through Jest's setupFiles.
const pending = new Set<ReturnType<typeof setTimeout>>();

if (typeof globalThis.requestIdleCallback !== "function") {
  globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
    const handle = setTimeout(() => {
      pending.delete(handle);
      callback({ didTimeout: false, timeRemaining: () => 50 });
    }, 1);
    pending.add(handle);
    return handle;
  }) as unknown as typeof requestIdleCallback;
  globalThis.cancelIdleCallback = ((handle: ReturnType<typeof setTimeout>) => {
    pending.delete(handle);
    clearTimeout(handle);
  }) as unknown as typeof cancelIdleCallback;
}

/** How many idle callbacks are scheduled and have neither run nor been cancelled. */
export const pendingIdleCallbacks = () => pending.size;
