import { SYNC_PLAY_TUNING } from "@/constants/SyncPlay";

/**
 * Adapts native loading snapshots to upstream's waiting/playing events.
 * Only waiting is delayed. Each completed loading cycle emits ready, even
 * if no Buffering request was sent: Seek uses that event to finish its handshake.
 */
export function createBufferingDebouncer(
  notify: (isBuffering: boolean) => void,
) {
  let lastObserved: boolean | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  return {
    notify(isBuffering: boolean): void {
      if (disposed || lastObserved === isBuffering) return;
      lastObserved = isBuffering;
      if (timer) clearTimeout(timer);
      timer = null;
      if (isBuffering) {
        timer = setTimeout(() => {
          timer = null;
          notify(true);
        }, SYNC_PLAY_TUNING.minBufferingThresholdMs);
      } else {
        notify(false);
      }
    },
    dispose(): void {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
