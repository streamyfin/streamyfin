import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { atom } from "jotai";

export type TVSubtitleModalState = {
  item: BaseItemDto;
  mediaSourceId?: string | null;
  subtitleTracks: MediaStream[];
  currentSubtitleIndex: number;
  onSubtitleIndexChange: (index: number) => void;
  onServerSubtitleDownloaded?: () => void;
  onLocalSubtitleDownloaded?: (path: string) => void;
} | null;

export const tvSubtitleModalAtom = atom<TVSubtitleModalState>(null);
