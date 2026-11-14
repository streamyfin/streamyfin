import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { atom } from "jotai";

/** A subtitle track the modal can list, with the callback that selects it. */
export type Track = {
  name: string;
  index: number;
  setTrack: () => void;
  /** True for client-side downloaded subtitles (e.g., from OpenSubtitles) */
  isLocal?: boolean;
  /** File path for local subtitles */
  localPath?: string;
};

export type TVSubtitleModalState = {
  item: BaseItemDto;
  mediaSourceId?: string | null;
  subtitleTracks: Track[];
  currentSubtitleIndex: number;
  onDisableSubtitles?: () => void;
  onServerSubtitleDownloaded?: () => void;
  onLocalSubtitleDownloaded?: (path: string) => void;
  refreshSubtitleTracks: () => Promise<Track[]>;
} | null;

export const tvSubtitleModalAtom = atom<TVSubtitleModalState>(null);
