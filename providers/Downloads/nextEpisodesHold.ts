import { atom } from "jotai";

/**
 * Why the next episodes of a series are not downloading, for the downloads
 * page and the download sheet to say so. Null while nothing holds them back.
 */
export type NextEpisodesHold = "low_space" | "waiting_for_wifi" | null;
export const nextEpisodesHoldAtom = atom<NextEpisodesHold>(null);
