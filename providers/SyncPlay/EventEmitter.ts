import Emitter from "eventemitter3";
import { WaitForEventDefaultTimeout } from "./constants";

/** Keep listener failures isolated while reusing the app's event library. */
export class EventEmitter {
  private readonly events = new Emitter<Record<string, unknown[]>>();

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.events.listeners(event).includes(callback))
      this.events.on(event, callback);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.off(event, callback);
  }

  emit(event: string, ...args: unknown[]): void {
    this.events.listeners(event).forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(
          `SyncPlay EventEmitter: handler for "${event}" threw`,
          error,
        );
      }
    });
  }

  removeAllListeners(event?: string): void {
    this.events.removeAllListeners(event);
  }
}

export class EventWaitTimeoutError extends Error {
  constructor(event: string) {
    super(`Timed out waiting for SyncPlay player event: ${event}`);
    this.name = "EventWaitTimeoutError";
  }
}

// React Native's AbortSignal polyfill has no reason/throwIfAborted API.
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("SyncPlay operation cancelled");
}

/**
 * Resolve on the next emission of `event`, or reject after `timeoutMs`
 * (or any event in `rejectEventTypes`). Cleans up every listener.
 */
export function waitForEventOnce(
  emitter: EventEmitter,
  event: string,
  timeoutMs: number = WaitForEventDefaultTimeout,
  rejectEventTypes?: string[],
  signal?: AbortSignal,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("SyncPlay operation cancelled"));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearAll = () => {
      emitter.off(event, handler);
      signal?.removeEventListener("abort", onAbort);
      if (timer) clearTimeout(timer);
      if (Array.isArray(rejectEventTypes)) {
        for (const eventName of rejectEventTypes) {
          emitter.off(eventName, rejectCallback);
        }
      }
    };

    const handler = (...args: unknown[]) => {
      clearAll();
      resolve(args);
    };

    const rejectCallback = (...args: unknown[]) => {
      clearAll();
      reject(args[0] ?? new Error("rejected"));
    };

    const onAbort = () => {
      clearAll();
      reject(new Error("SyncPlay operation cancelled"));
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        clearAll();
        reject(new EventWaitTimeoutError(event));
      }, timeoutMs);
    }

    emitter.on(event, handler);
    signal?.addEventListener("abort", onAbort, { once: true });

    if (Array.isArray(rejectEventTypes)) {
      for (const eventName of rejectEventTypes) {
        emitter.on(eventName, rejectCallback);
      }
    }
  });
}
