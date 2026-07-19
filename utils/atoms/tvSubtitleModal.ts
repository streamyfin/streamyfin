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
  /**
   * Run the selection callback AFTER the modal route is dismissed. Needed when
   * `setTrack` navigates (the player's replacePlayer for a burn-in switch),
   * which would be swallowed by the still-active modal route. Leave false for
   * callers whose selection only updates state (the item detail page), so the
   * update runs before dismissal and doesn't yank focus after it returns.
   */
  deferApplyUntilDismissed?: boolean;
} | null;

export const tvSubtitleModalAtom = atom<TVSubtitleModalState>(null);
