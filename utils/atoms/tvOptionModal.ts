import { atom } from "jotai";

export type TVOptionItem<T = any> = {
  label: string;
  sublabel?: string;
  value: T;
  selected: boolean;
};

export type TVOptionModalState = {
  title: string;
  options: TVOptionItem[];
  onSelect: (value: any) => void;
  cardWidth?: number;
  cardHeight?: number;
  /**
   * Run onSelect AFTER the modal route is dismissed. Used when onSelect opens
   * the player (the series shuffle), so it opens once the sheet is gone rather
   * than under it.
   * Default (false) runs onSelect before closing, so state-only callers (detail
   * page, library filters, settings) don't re-render after focus returns and
   * lose TV focus.
   */
  deferApplyUntilDismissed?: boolean;
} | null;

export const tvOptionModalAtom = atom<TVOptionModalState>(null);
