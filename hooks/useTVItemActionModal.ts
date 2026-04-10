import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";

export const useTVItemActionModal = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { markItemPlayed, markItemUnplayed } = usePlaybackManager();
  const invalidatePlaybackProgressCache = useInvalidatePlaybackProgressCache();

  const showItemActions = useCallback(
    (item: BaseItemDto) => {
      const isPlayed = item.UserData?.Played ?? false;
      const itemTitle =
        item.Type === "Episode"
          ? `${item.SeriesName} - ${item.Name}`
          : (item.Name ?? "");

      const actionLabel = isPlayed
        ? t("item_card.mark_unplayed")
        : t("item_card.mark_played");

      Alert.alert(itemTitle, undefined, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: actionLabel,
          onPress: async () => {
            if (!item.Id) return;

            // Optimistic update
            queryClient.setQueriesData<BaseItemDto | null | undefined>(
              { queryKey: ["item", item.Id] },
              (old) => {
                if (!old) return old;
                return {
                  ...old,
                  UserData: {
                    ...old.UserData,
                    Played: !isPlayed,
                    PlaybackPositionTicks: 0,
                    PlayedPercentage: 0,
                  },
                };
              },
            );

            try {
              if (!isPlayed) {
                await markItemPlayed(item.Id);
              } else {
                await markItemUnplayed(item.Id);
              }
            } catch {
              // Revert on failure
              queryClient.invalidateQueries({
                queryKey: ["item", item.Id],
              });
            } finally {
              await invalidatePlaybackProgressCache();
              queryClient.invalidateQueries({
                queryKey: ["item", item.Id],
              });
            }
          },
        },
      ]);
    },
    [
      t,
      queryClient,
      markItemPlayed,
      markItemUnplayed,
      invalidatePlaybackProgressCache,
    ],
  );

  return { showItemActions };
};
