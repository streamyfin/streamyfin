import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback } from "react";
import type { Track } from "@/components/video-player/controls/types";
import useRouter from "@/hooks/useAppRouter";
import { tvSubtitleModalAtom } from "@/utils/atoms/tvSubtitleModal";
import { store } from "@/utils/store";

interface ShowSubtitleModalParams {
  item: BaseItemDto;
  mediaSourceId?: string | null;
  subtitleTracks: Track[];
  currentSubtitleIndex: number;
  onDisableSubtitles?: () => void;
  onServerSubtitleDownloaded?: () => void;
  onLocalSubtitleDownloaded?: (path: string) => void;
  refreshSubtitleTracks?: () => Promise<Track[]>;
}

export const useTVSubtitleModal = () => {
  const router = useRouter();

  const showSubtitleModal = useCallback(
    (params: ShowSubtitleModalParams) => {
      store.set(tvSubtitleModalAtom, {
        item: params.item,
        mediaSourceId: params.mediaSourceId,
        subtitleTracks: params.subtitleTracks,
        currentSubtitleIndex: params.currentSubtitleIndex,
        onDisableSubtitles: params.onDisableSubtitles,
        onServerSubtitleDownloaded: params.onServerSubtitleDownloaded,
        onLocalSubtitleDownloaded: params.onLocalSubtitleDownloaded,
        refreshSubtitleTracks: params.refreshSubtitleTracks,
      });
      router.push("/(auth)/tv-subtitle-modal");
    },
    [router],
  );

  return { showSubtitleModal };
};
