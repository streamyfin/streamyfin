import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import { type PropsWithChildren, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useDownload } from "@/providers/DownloadProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";

interface Props extends TouchableOpacityProps {
  item: BaseItemDto;
}

export const itemRouter = (item: BaseItemDto, from: string) => {
  if ("CollectionType" in item && item.CollectionType === "livetv") {
    return `/(auth)/(tabs)/${from}/livetv`;
  }

  if ("CollectionType" in item && item.CollectionType === "music") {
    return `/(auth)/(tabs)/(libraries)/music/${item.Id}`;
  }

  if (item.Type === "Series") {
    return `/(auth)/(tabs)/${from}/series/${item.Id}`;
  }

  if (item.Type === "Person") {
    return `/(auth)/(tabs)/${from}/persons/${item.Id}`;
  }

  if (item.Type === "BoxSet") {
    return `/(auth)/(tabs)/${from}/collections/${item.Id}`;
  }

  if (item.Type === "UserView") {
    return `/(auth)/(tabs)/${from}/collections/${item.Id}`;
  }

  if (item.Type === "CollectionFolder") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  if (item.Type === "Playlist") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  return `/(auth)/(tabs)/${from}/items/page?id=${item.Id}`;
};

export const getItemNavigation = (item: BaseItemDto, _from: string) => {
  if ("CollectionType" in item && item.CollectionType === "livetv") {
    return {
      pathname: "/livetv" as const,
    };
  }

  if ("CollectionType" in item && item.CollectionType === "music") {
    return {
      pathname: "/music/[libraryId]" as const,
      params: { libraryId: item.Id! },
    };
  }

  if (item.Type === "Series") {
    return {
      pathname: "/series/[id]" as const,
      params: { id: item.Id! },
    };
  }

  if (item.Type === "Person") {
    return {
      pathname: "/persons/[personId]" as const,
      params: { personId: item.Id! },
    };
  }

  if (item.Type === "BoxSet" || item.Type === "UserView") {
    return {
      pathname: "/collections/[collectionId]" as const,
      params: { collectionId: item.Id! },
    };
  }

  if (item.Type === "CollectionFolder") {
    return {
      pathname: "/[libraryId]" as const,
      params: { libraryId: item.Id! },
    };
  }

  // Music types - use shared routes for proper back navigation
  if (item.Type === "MusicArtist") {
    return {
      pathname: "/music/artist/[artistId]" as const,
      params: { artistId: item.Id! },
    };
  }

  if (item.Type === "MusicAlbum") {
    return {
      pathname: "/music/album/[albumId]" as const,
      params: { albumId: item.Id! },
    };
  }

  if (item.Type === "Audio") {
    // Navigate to the album if available, otherwise to the item page
    if (item.AlbumId) {
      return {
        pathname: "/music/album/[albumId]" as const,
        params: { albumId: item.AlbumId },
      };
    }
    return {
      pathname: "/items/page" as const,
      params: { id: item.Id! },
    };
  }

  if (item.Type === "Playlist") {
    if (Platform.isTV) {
      return {
        pathname: "/[libraryId]" as const,
        params: { libraryId: item.Id! },
      };
    }
    return {
      pathname: "/music/playlist/[playlistId]" as const,
      params: { playlistId: item.Id! },
    };
  }

  // Default case - items page
  return {
    pathname: "/items/page" as const,
    params: { id: item.Id! },
  };
};

export const TouchableItemRouter: React.FC<PropsWithChildren<Props>> = ({
  item,
  children,
  ...props
}) => {
  const { t } = useTranslation();
  const segments = useSegments();
  const { showActionSheetWithOptions } = useActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item]);
  const { isFavorite, toggleFavorite } = useFavorite(item);
  const { isWatchlisted, toggleWatchlist } = useWatchlist(item);
  const { settings } = useSettings();
  const router = useRouter();
  const isOffline = useOfflineMode();
  const { deleteFile } = useDownload();

  const from = (segments as string[])[2] || "(home)";

  const handlePress = useCallback(() => {
    // Force music libraries to navigate via the explicit string route.
    // This avoids losing the dynamic [libraryId] param when going through a nested navigator.
    if ("CollectionType" in item && item.CollectionType === "music") {
      router.push(itemRouter(item, from) as any);
      return;
    }

    const navigation = getItemNavigation(item, from);
    router.push(navigation as any);
  }, [from, item, router]);

  const showActionSheet = useCallback(() => {
    if (
      !(
        item.Type === "Movie" ||
        item.Type === "Episode" ||
        item.Type === "Series"
      )
    )
      return;

    // Build options as { label, action } so dynamic entries (watchlist,
    // offline delete) don't break index-based handling.
    const actions: {
      label: string;
      action: () => void;
      destructive?: boolean;
    }[] = [
      {
        label: t("common.mark_as_played"),
        action: () => {
          markAsPlayedStatus(true);
        },
      },
      {
        label: t("common.mark_as_not_played"),
        action: () => {
          markAsPlayedStatus(false);
        },
      },
      {
        label: isFavorite
          ? t("music.track_options.remove_from_favorites")
          : t("music.track_options.add_to_favorites"),
        action: toggleFavorite,
      },
    ];

    if (settings?.useKefinTweaks) {
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
    const destructiveButtonIndex = actions.findIndex((a) => a.destructive);

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex:
          destructiveButtonIndex === -1 ? undefined : destructiveButtonIndex,
      },
      (selectedIndex) => {
        if (selectedIndex === undefined || selectedIndex >= actions.length)
          return;
        actions[selectedIndex].action();
      },
    );
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
    t,
  ]);

  if (
    from === "(home)" ||
    from === "(search)" ||
    from === "(libraries)" ||
    from === "(favorites)" ||
    from === "(watchlists)"
  )
    return (
      <TouchableOpacity
        onLongPress={showActionSheet}
        onPress={handlePress}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );

  return null;
};
