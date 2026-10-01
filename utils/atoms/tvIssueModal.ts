import { atom } from "jotai";

/** What the TV's report issue sheet files an issue against. */
export type TVIssueModalState = {
  /** The title's name, shown over the sheet. */
  title: string;
  /** Seerr's media id for the title (its mediaInfo), not TMDB's. */
  mediaId: number;
} | null;

export const tvIssueModalAtom = atom<TVIssueModalState>(null);
