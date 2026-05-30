import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import { type PropsWithChildren, useCallback } from "react";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { useDownload } from "@/providers/DownloadProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

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

  // Channel navigation
  if (item.Type === "Channel") {
    return `/(auth)/(tabs)/${from}/channels/${item.Id}`;
  }

  if (item.Type === "ChannelFolderItem") {
    return `/(auth)/(tabs)/${from}/channels/${item.ChannelId}/folder/${item.Id}`;
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

  // Channel navigation
  if (item.Type === "Channel") {
    return {
      pathname: "/channels/[channelId]" as const,
      params: { channelId: item.Id! },
    };
  }

  if (item.Type === "ChannelFolderItem") {
    return {
      pathname: "/channels/[channelId]/folder/[folderId]" as const,
      params: { channelId: item.ChannelId!, folderId: item.Id! },
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
  const segments = useSegments();
  const { showActionSheetWithOptions } = useActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item]);
  const { isFavorite, toggleFavorite } = useFavorite(item);
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

    const options: string[] = [
      "Mark as Played",
      "Mark as Not Played",
      isFavorite ? "Unmark as Favorite" : "Mark as Favorite",
      ...(isOffline ? ["Delete Download"] : []),
      "Cancel",
    ];
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = isOffline
      ? cancelButtonIndex - 1
      : undefined;

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
      },
    );
  }, [
    showActionSheetWithOptions,
    isFavorite,
    markAsPlayedStatus,
    toggleFavorite,
    isOffline,
    deleteFile,
    item.Id,
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
