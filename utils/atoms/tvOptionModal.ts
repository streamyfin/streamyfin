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
   * Run onSelect AFTER the modal route is dismissed. Needed only when onSelect
   * navigates (the in-player audio switch replacing the player while
   * transcoding), which the still-active modal route would otherwise swallow.
   * Default (false) runs onSelect before closing, so state-only callers (detail
   * page, library filters, settings) don't re-render after focus returns and
   * lose TV focus.
   */
  deferApplyUntilDismissed?: boolean;
} | null;

export const tvOptionModalAtom = atom<TVOptionModalState>(null);
