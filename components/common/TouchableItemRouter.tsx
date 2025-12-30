import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter, useSegments } from "expo-router";
import { useAtom } from "jotai";
import { type PropsWithChildren, useCallback } from "react";
import {
  Alert,
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { toSong } from "@/models/music/adapters";
import { getDownloadedAudioById } from "@/providers/AudioPlayer/database";
import { useAudioPlayer } from "@/providers/AudioPlayerProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

interface Props extends TouchableOpacityProps {
  item: BaseItemDto;
  isOffline?: boolean;
}

export const itemRouter = (item: BaseItemDto, from: string) => {
  if ("CollectionType" in item && item.CollectionType === "livetv") {
    return `/(auth)/(tabs)/${from}/livetv`;
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

  // Music library - show music landing page
  if (item.Type === "CollectionFolder" && item.CollectionType === "music") {
    return `/(auth)/(tabs)/(libraries)/music/${item.Id}`;
  }

  if (item.Type === "CollectionFolder") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  if (item.Type === "Playlist") {
    return `/(auth)/(tabs)/(libraries)/${item.Id}`;
  }

  // Music album - show album tracks
  if (item.Type === "MusicAlbum") {
    return `/(auth)/(tabs)/${from}/albums/${item.Id}`;
  }

  // Music artist - show artist detail
  if (item.Type === "MusicArtist") {
    return `/(auth)/(tabs)/${from}/music/artist/${item.Id}`;
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

  // Music library - show music landing page
  if (item.Type === "CollectionFolder" && item.CollectionType === "music") {
    return {
      pathname: "/music/[libraryId]" as const,
      params: { libraryId: item.Id! },
    };
  }

  if (item.Type === "CollectionFolder") {
    return {
      pathname: "/[libraryId]" as const,
      params: { libraryId: item.Id! },
    };
  }

  if (item.Type === "Playlist") {
    return {
      pathname: "/[libraryId]" as const,
      params: { libraryId: item.Id! },
    };
  }

  // Music album - show album tracks
  if (item.Type === "MusicAlbum") {
    return {
      pathname: "/albums/[albumId]" as const,
      params: { albumId: item.Id! },
    };
  }

  // Music artist - show artist detail
  if (item.Type === "MusicArtist") {
    return {
      pathname: "/music/artist/[artistId]" as const,
      params: { artistId: item.Id! },
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

  // Default case - items page
  return {
    pathname: "/items/page" as const,
    params: { id: item.Id! },
  };
};

export const TouchableItemRouter: React.FC<PropsWithChildren<Props>> = ({
  item,
  isOffline = false,
  children,
  ...props
}) => {
  const router = useRouter();
  const segments = useSegments();
  const { showActionSheetWithOptions } = useActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item]);
  const { isFavorite, toggleFavorite } = useFavorite(item);
  const { playSong, isReady: isAudioPlayerReady } = useAudioPlayer();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const from = (segments as string[])[2] || "(home)";

  // Check if this is an audio episode (podcast) or audiobook
  const isAudioEpisode =
    (item?.Type === "Episode" && item?.MediaType === "Audio") ||
    item?.Type === "AudioBook" ||
    item?.Type === "Audio";

  const showActionSheet = useCallback(() => {
    if (
      !(
        item.Type === "Movie" ||
        item.Type === "Episode" ||
        item.Type === "Series"
      )
    )
      return;
    const options = [
      "Mark as Played",
      "Mark as Not Played",
      isFavorite ? "Unmark as Favorite" : "Mark as Favorite",
      "Cancel",
    ];
    const cancelButtonIndex = 3;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      async (selectedIndex) => {
        if (selectedIndex === 0) {
          await markAsPlayedStatus(true);
        } else if (selectedIndex === 1) {
          await markAsPlayedStatus(false);
        } else if (selectedIndex === 2) {
          toggleFavorite();
        }
      },
    );
  }, [showActionSheetWithOptions, isFavorite, markAsPlayedStatus]);

  const handlePress = useCallback(async () => {
    // Handle audio episodes (podcasts) - play directly in audio player
    if (isAudioEpisode && isAudioPlayerReady) {
      try {
        console.log(
          "[TouchableItemRouter] Playing audio episode via audio player:",
          item.Name,
        );
        // Convert BaseItemDto to Song
        const downloadedAudioItem = item.Id
          ? getDownloadedAudioById(item.Id)
          : undefined;
        const song = toSong(
          item,
          downloadedAudioItem
            ? {
                filePath: downloadedAudioItem.audioFilePath,
                fileSize: downloadedAudioItem.audioFileSize,
                cacheType: downloadedAudioItem.cacheType as any,
                downloadedAt: new Date(),
                playCount: downloadedAudioItem.playCount || 0,
                lastPlayedAt: downloadedAudioItem.lastPlayedDate
                  ? new Date(downloadedAudioItem.lastPlayedDate)
                  : undefined,
              }
            : undefined,
          api || undefined,
          user?.Id,
        );
        // Let the controller handle conversion and state management
        await playSong(song);
        router.push("/(auth)/audio-player");
        return;
      } catch (error) {
        console.error(
          "[TouchableItemRouter] Error playing audio episode:",
          error,
        );
        Alert.alert("Error", "Failed to play audio episode");
        return;
      }
    }

    // Default navigation for other items
    if (isOffline) {
      // For offline mode, we still need to use query params
      const url = `${itemRouter(item, from)}&offline=true`;
      router.push(url as any);
      return;
    }

    const navigation = getItemNavigation(item, from);
    router.push(navigation as any);
  }, [
    isAudioEpisode,
    isAudioPlayerReady,
    item,
    api,
    user,
    playSong,
    router,
    isOffline,
    from,
  ]);

  if (
    from === "(home)" ||
    from === "(search)" ||
    from === "(libraries)" ||
    from === "(favorites)"
  ) {
    return (
      <TouchableOpacity
        onLongPress={showActionSheet}
        onPress={handlePress}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return null;
};
