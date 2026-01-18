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
} | null;

export const tvOptionModalAtom = atom<TVOptionModalState>(null);
