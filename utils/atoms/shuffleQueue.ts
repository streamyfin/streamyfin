import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";

/**
 * A play queue: the items one Shuffle or Play All lined up, in play order.
 *
 * Streamyfin has no persistent play queue; "next episode" is normally derived
 * on the fly from adjacent episodes (see `usePlaybackManager`). When the user
 * shuffles a series, or plays or shuffles a library, the whole ordered list
 * is stored here. Because it lives in the Jotai store it survives the
 * `router.replace` remount that happens on every TV item transition, so
 * `usePlaybackManager` can keep walking the same order across items.
 */
export interface ShuffleQueue {
  items: BaseItemDto[];
}

export const shuffleQueueAtom = atom<ShuffleQueue | null>(null);
