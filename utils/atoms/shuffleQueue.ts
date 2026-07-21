import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";

/**
 * A pre-shuffled play queue for a single series.
 *
 * Streamyfin has no persistent play queue; "next episode" is normally derived
 * on the fly from adjacent episodes (see `usePlaybackManager`). When the user
 * starts a shuffle, we store the full randomized episode list here. Because it
 * lives in the Jotai store it survives the `router.replace` remount that
 * happens on every TV episode transition, so `usePlaybackManager` can keep
 * walking the same shuffled order across episodes.
 */
export interface ShuffleQueue {
  seriesId: string;
  items: BaseItemDto[];
}

export const shuffleQueueAtom = atom<ShuffleQueue | null>(null);
