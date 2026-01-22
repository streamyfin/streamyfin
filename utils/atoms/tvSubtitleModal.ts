import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { atom } from "jotai";
import type { Track } from "@/components/video-player/controls/types";

export type TVSubtitleModalState = {
  item: BaseItemDto;
  mediaSourceId?: string | null;
  subtitleTracks: Track[];
  currentSubtitleIndex: number;
  onDisableSubtitles?: () => void;
  onServerSubtitleDownloaded?: () => void;
  onLocalSubtitleDownloaded?: (path: string) => void;
  refreshSubtitleTracks?: () => Promise<Track[]>;
} | null;

export const tvSubtitleModalAtom = atom<TVSubtitleModalState>(null);
