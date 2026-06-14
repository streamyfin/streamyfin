import { atom } from "jotai";
import type { MediaStatus } from "@/utils/jellyseerr/server/constants/media";

export type TVSeasonSelectModalState = {
  seasons: Array<{
    id: number;
    seasonNumber: number;
    episodeCount: number;
    status: MediaStatus;
  }>;
  title: string;
  mediaId: number;
  tvdbId?: number;
  hasAdvancedRequestPermission: boolean;
  onRequested: () => void;
} | null;

export const tvSeasonSelectModalAtom = atom<TVSeasonSelectModalState>(null);
