/**
 * Per-instance event emitter — replaces jellyfin-web's global `Events.trigger`
 * bus. Listeners that throw are caught and logged so one bad listener can't
 * break the rest.
 */

import { WaitForEventDefaultTimeout } from "./constants";

export class EventEmitter {
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((callback) => {
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
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
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
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearAll = () => {
      emitter.off(event, handler);
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

    if (timeoutMs) {
      timer = setTimeout(() => {
        clearAll();
        reject(new Error("Timed out."));
      }, timeoutMs);
    }

    emitter.on(event, handler);

    if (Array.isArray(rejectEventTypes)) {
      for (const eventName of rejectEventTypes) {
        emitter.on(eventName, rejectCallback);
      }
    }
  });
}
