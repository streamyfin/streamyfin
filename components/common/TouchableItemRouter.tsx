import { useActionSheet } from "@expo/react-native-action-sheet";
import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter, useSegments } from "expo-router";
import { type PropsWithChildren, useCallback } from "react";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";

interface Props extends TouchableOpacityProps {
  item: BaseItemDto;
  isOffline?: boolean;
}

export const itemRouter = (
  item: BaseItemDto | BaseItemPerson,
  from: string,
) => {
  if ("CollectionType" in item && item.CollectionType === "livetv") {
    return `/(auth)/(tabs)/${from}/livetv`;
  }

  if (item.Type === "Series") {
    return `/(auth)/(tabs)/${from}/series/${item.Id}`;
  }

  if (item.Type === "Person" || item.Type === "Actor") {
    return `/(auth)/(tabs)/${from}/actors/${item.Id}`;
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

  const from = segments[2];

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

  if (
    from === "(home)" ||
    from === "(search)" ||
    from === "(libraries)" ||
    from === "(favorites)"
  )
    return (
      <TouchableOpacity
        onLongPress={showActionSheet}
        onPress={() => {
          let url = itemRouter(item, from);
          if (isOffline) {
            url += `&offline=true`;
          }
          // @ts-expect-error
          router.push(url);
        }}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );

  return null;
};
