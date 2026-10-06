import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * The native player's queue only holds the tracks loaded so far: one after a
 * restored queue resumes, a growing part of it while the rest loads in the
 * background. An index into the app's queue therefore does not address it, and
 * the native side rejects one that falls outside. These resolve a track by id
 * against the native queue as it is right now.
 */
interface NativeTrack {
  id?: string;
}

/**
 * Where a track sits in the native queue, or -1 while it is not loaded.
 *
 * A queue can hold the same track twice, and an id cannot tell the copies
 * apart. `appIndex` settles it whenever the two queues line up there, which
 * they do once the native one is fully loaded.
 */
export const nativeIndexOf = (
  nativeQueue: NativeTrack[],
  trackId: string | null | undefined,
  appIndex?: number,
): number => {
  if (!trackId) return -1;
  if (appIndex !== undefined && nativeQueue[appIndex]?.id === trackId) {
    return appIndex;
  }
  return nativeQueue.findIndex((track) => track.id === trackId);
};

/**
 * Where to insert the track at `appIndex` so the native queue keeps the app
 * queue's order: in front of the first later track that is already loaded.
 * `undefined` when none is, which appends.
 */
export const nativeInsertIndexFor = (
  appQueue: BaseItemDto[],
  appIndex: number,
  nativeQueue: NativeTrack[],
): number | undefined => {
  for (let i = appIndex + 1; i < appQueue.length; i++) {
    const nativeIndex = nativeIndexOf(nativeQueue, appQueue[i].Id);
    if (nativeIndex >= 0) return nativeIndex;
  }
  return undefined;
};
