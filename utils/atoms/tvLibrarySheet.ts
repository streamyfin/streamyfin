import { atom } from "jotai";

export type TVLibrarySheetOption = {
  label: string;
  value: string;
  selected: boolean;
};

/** One thing a sheet lets the viewer set: a filter, the sort field, a letter. */
export type TVLibrarySheetGroup = {
  key: string;
  label: string;
  /** What is set right now, shown next to the label. */
  summary: string;
  options: TVLibrarySheetOption[];
  onSelect: (value: string) => void;
  /**
   * A set being built: the options stay up after a pick. Without it a pick is
   * the whole answer and the sheet moves on.
   */
  multi?: boolean;
  /** Short labels (letters), drawn as a grid of small cards. */
  compact?: boolean;
};

export type TVLibrarySheetState = {
  title: string;
  groups: TVLibrarySheetGroup[];
  /** Clears every group. Only offered while something is set. */
  onReset?: () => void;
  /** The sheet has left the screen, however it was closed. */
  onClose?: () => void;
} | null;

/**
 * The library page's sheet. The page keeps it up to date while the sheet is
 * open, so a pick shows in the sheet without closing it.
 */
export const tvLibrarySheetAtom = atom<TVLibrarySheetState>(null);
