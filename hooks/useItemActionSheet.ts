import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { useDownload } from "@/providers/DownloadProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

/**
 * The long-press action sheet for a media item: played state, favorite, and —
 * offline — deleting the download.
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
  const isOffline = useOfflineMode();
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

    const options: string[] = [
      t("common.mark_as_played"),
      t("common.mark_as_not_played"),
      isFavorite
        ? t("music.track_options.remove_from_favorites")
        : t("music.track_options.add_to_favorites"),
      ...(isOffline ? [t("home.downloads.delete_download")] : []),
      t("common.cancel"),
    ];
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = isOffline
      ? cancelButtonIndex - 1
      : undefined;

    return new Promise<void>((resolve) => {
      showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
        },
        async (selectedIndex) => {
          if (selectedIndex === 0) {
            await markAsPlayedStatus(true);
          } else if (selectedIndex === 1) {
            await markAsPlayedStatus(false);
          } else if (selectedIndex === 2) {
            toggleFavorite();
          } else if (isOffline && selectedIndex === 3 && item.Id) {
            deleteFile(item.Id);
          }
          resolve();
        },
      );
    });
  }, [
    showActionSheetWithOptions,
    isFavorite,
    markAsPlayedStatus,
    toggleFavorite,
    isOffline,
    deleteFile,
    item.Id,
    item.Type,
    t,
  ]);
}
