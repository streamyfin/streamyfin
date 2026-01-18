import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { tvSubtitleModalAtom } from "@/utils/atoms/tvSubtitleModal";
import { store } from "@/utils/store";

interface ShowSubtitleModalParams {
  item: BaseItemDto;
  mediaSourceId?: string | null;
  subtitleTracks: MediaStream[];
  currentSubtitleIndex: number;
  onSubtitleIndexChange: (index: number) => void;
  onServerSubtitleDownloaded?: () => void;
  onLocalSubtitleDownloaded?: (path: string) => void;
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
        onSubtitleIndexChange: params.onSubtitleIndexChange,
        onServerSubtitleDownloaded: params.onServerSubtitleDownloaded,
        onLocalSubtitleDownloaded: params.onLocalSubtitleDownloaded,
      });
      router.push("/(auth)/tv-subtitle-modal");
    },
    [router],
  );

  return { showSubtitleModal };
};
