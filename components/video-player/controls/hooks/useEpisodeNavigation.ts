import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { useHaptic } from "@/hooks/useHaptic";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";

interface UseEpisodeNavigationProps {
  item: BaseItemDto;
  offline: boolean;
  mediaSource?: MediaSourceInfo | null;
}

export const useEpisodeNavigation = ({
  item,
  offline,
  mediaSource,
}: UseEpisodeNavigationProps) => {
  const [settings, updateSettings] = useSettings();
  const router = useRouter();
  const lightHapticFeedback = useHaptic("light");

  const { bitrateValue, subtitleIndex, audioIndex } = useLocalSearchParams<{
    bitrateValue: string;
    audioIndex: string;
    subtitleIndex: string;
  }>();

  const { previousItem, nextItem } = usePlaybackManager({
    item,
    isOffline: offline,
  });

  const goToItemCommon = useCallback(
    (item: BaseItemDto) => {
      if (!item || !settings) {
        return;
      }
      lightHapticFeedback();
      const previousIndexes = {
        subtitleIndex: subtitleIndex
          ? Number.parseInt(subtitleIndex, 10)
          : undefined,
        audioIndex: audioIndex ? Number.parseInt(audioIndex, 10) : undefined,
      };

      const {
        mediaSource: newMediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(
        item,
        settings,
        previousIndexes,
        mediaSource ?? undefined,
      );

      const queryParams = new URLSearchParams({
        ...(offline && { offline: "true" }),
        itemId: item.Id ?? "",
        audioIndex: defaultAudioIndex?.toString() ?? "",
        subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
        mediaSourceId: newMediaSource?.Id ?? "",
        bitrateValue: bitrateValue?.toString(),
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "",
      }).toString();

      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
    },
    [
      settings,
      subtitleIndex,
      audioIndex,
      mediaSource,
      bitrateValue,
      router,
      lightHapticFeedback,
    ],
  );

  const goToPreviousItem = useCallback(() => {
    if (!previousItem) {
      return;
    }
    goToItemCommon(previousItem);
  }, [previousItem, goToItemCommon]);

  const goToNextItem = useCallback(
    ({
      isAutoPlay,
      resetWatchCount,
    }: {
      isAutoPlay?: boolean;
      resetWatchCount?: boolean;
    }) => {
      if (!nextItem) {
        return;
      }

      if (!isAutoPlay) {
        // if we are not autoplaying, we won't update anything, we just go to the next item
        goToItemCommon(nextItem);
        if (resetWatchCount) {
          updateSettings({
            autoPlayEpisodeCount: 0,
          });
        }
        return;
      }

      // Skip autoplay logic if maxAutoPlayEpisodeCount is -1
      if (settings.maxAutoPlayEpisodeCount.value === -1) {
        goToItemCommon(nextItem);
        return;
      }

      if (
        settings.autoPlayEpisodeCount + 1 <
        settings.maxAutoPlayEpisodeCount.value
      ) {
        goToItemCommon(nextItem);
      }

      // Check if the autoPlayEpisodeCount is less than maxAutoPlayEpisodeCount for the autoPlay
      if (
        settings.autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value
      ) {
        // update the autoPlayEpisodeCount in settings
        updateSettings({
          autoPlayEpisodeCount: settings.autoPlayEpisodeCount + 1,
        });
      }
    },
    [nextItem, goToItemCommon, settings, updateSettings],
  );

  // Memoized handlers
  const handleNextEpisodeAutoPlay = useCallback(() => {
    goToNextItem({ isAutoPlay: true });
  }, [goToNextItem]);

  const handleNextEpisodeManual = useCallback(() => {
    goToNextItem({ isAutoPlay: false });
  }, [goToNextItem]);

  const handleContinueWatching = useCallback(
    (options: { isAutoPlay?: boolean; resetWatchCount?: boolean }) => {
      goToNextItem(options);
    },
    [goToNextItem],
  );

  return {
    previousItem,
    nextItem,
    goToItemCommon,
    goToPreviousItem,
    goToNextItem,
    handleNextEpisodeAutoPlay,
    handleNextEpisodeManual,
    handleContinueWatching,
  };
};
