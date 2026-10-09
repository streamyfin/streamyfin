import { atom } from "jotai";
import type { SyncPlaySeed } from "@/utils/syncplay/types";

/**
 * What the page behind the TV SyncPlay sheet can queue in a new group. Null
 * when it has nothing a group can play: the sheet opens either way.
 */
export const tvSyncPlayModalAtom = atom<SyncPlaySeed | null>(null);
