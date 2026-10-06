import { atom } from "jotai";
import type { TvDetails } from "@/utils/seerr/types";

export type TVSeasonSelectModalState = {
  /** The series, whose seasons, requests and library state the sheet reads. */
  series: TvDetails;
  title: string;
  mediaId: number;
  tvdbId?: number;
  hasAdvancedRequestPermission: boolean;
  onRequested: () => void;
} | null;

export const tvSeasonSelectModalAtom = atom<TVSeasonSelectModalState>(null);
