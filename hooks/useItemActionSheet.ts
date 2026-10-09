import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useDownload } from "@/providers/DownloadProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";

/**
 * The long-press action sheet for a media item: played state, favorite, the
 * KefinTweaks watchlist when enabled and online, and — offline — deleting the
 * download.
 *
 * Returns a function that presents the sheet and resolves once it closes, so a
 * caller that mounts it on demand knows when to unmount again. Unsupported item
 * types present nothing and resolve immediately.
 */
export function useItemActionSheet(item: BaseItemDto) {
  const { t } = useTranslation();
  const { showActionSheetWithOptions } = useActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item]);
  const { isFavorite, toggleFavorite } = useFavorite(item);
  const { settings } = useSettings();
  const isOffline = useOfflineMode();
  // Every card mounts this hook: where the entry is not offered, keep the
  // watchlist toggle passive so the cards write nothing shared on mount.
  const { isWatchlisted, toggleWatchlist } = useWatchlist(item, {
    enabled: !!settings?.useKefinTweaks && !isOffline,
  });
  const { deleteFile } = useDownload();

  return useCallback((): Promise<void> => {
    if (
      !(
        item.Type === "Movie" ||
        item.Type === "Episode" ||
        item.Type === "Series"
      )
    ) {
      return Promise.resolve();
    }

    // Labels and actions travel together so the optional entries (watchlist,
    // offline delete) never shift another entry's index.
    const actions: {
      label: string;
      action: () => void | Promise<void>;
      destructive?: boolean;
    }[] = [
      {
        label: t("common.mark_as_played"),
        action: () => markAsPlayedStatus(true),
      },
      {
        label: t("common.mark_as_not_played"),
        action: () => markAsPlayedStatus(false),
      },
      {
        label: isFavorite
          ? t("music.track_options.remove_from_favorites")
          : t("music.track_options.add_to_favorites"),
        action: toggleFavorite,
      },
    ];

    // The watchlist is Jellyfin's Likes rating; offline the toggle could only
    // fail.
    if (settings?.useKefinTweaks && !isOffline) {
      actions.push({
        label: isWatchlisted
          ? t("watchlists.remove_from_watchlist")
          : t("watchlists.add_to_watchlist"),
        action: toggleWatchlist,
      });
    }

    if (isOffline && item.Id) {
      const id = item.Id;
      actions.push({
        label: t("home.downloads.delete_download"),
        action: () => deleteFile(id),
        destructive: true,
      });
    }

    const options = [...actions.map((a) => a.label), t("common.cancel")];
    const cancelButtonIndex = options.length - 1;
    const destructiveIndex = actions.findIndex((a) => a.destructive);

    return new Promise<void>((resolve) => {
      showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex:
            destructiveIndex === -1 ? undefined : destructiveIndex,
        },
        async (selectedIndex) => {
          // Resolve however the action ends: the host unmounts the sheet on
          // it, and a failed action must not keep it mounted.
          try {
            if (
              selectedIndex !== undefined &&
              selectedIndex >= 0 &&
              selectedIndex < actions.length
            ) {
              await actions[selectedIndex].action();
            }
          } finally {
            resolve();
          }
        },
      );
    });
  }, [
    showActionSheetWithOptions,
    isFavorite,
    markAsPlayedStatus,
    toggleFavorite,
    isWatchlisted,
    toggleWatchlist,
    settings?.useKefinTweaks,
    isOffline,
    deleteFile,
    item.Id,
    item.Type,
    t,
  ]);
}
