import { atom } from "jotai";

export type TVSeriesSeasonModalState = {
  seasons: Array<{
    label: string;
    value: number;
    selected: boolean;
  }>;
  selectedSeasonIndex: number | string;
  itemId: string;
  onSeasonSelect: (seasonIndex: number) => void;
} | null;

export const tvSeriesSeasonModalAtom = atom<TVSeriesSeasonModalState>(null);
