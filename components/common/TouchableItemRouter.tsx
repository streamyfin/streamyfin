import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter, useSegments } from "expo-router";
import { PropsWithChildren, useCallback } from "react";
import { TouchableOpacity, TouchableOpacityProps } from "react-native";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { useHaptic } from "@/hooks/useHaptic";

interface Props extends TouchableOpacityProps {
  item: BaseItemDto;
}

export const itemRouter = (
  item: BaseItemDto | BaseItemPerson,
  from: string
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
  children,
  ...props
}) => {
  const router = useRouter();
  const segments = useSegments();
  const { showActionSheetWithOptions } = useActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item]);

  const from = segments[2];

  const showActionSheet = useCallback(() => {
    if (!(item.Type === "Movie" || item.Type === "Episode")) return;

    const options = ["Mark as Played", "Mark as Not Played", "Cancel"];
    const cancelButtonIndex = 2;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      async (selectedIndex) => {
        if (selectedIndex === 0) {
          await markAsPlayedStatus(true);
          // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (selectedIndex === 1) {
          await markAsPlayedStatus(false);
          // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    );
  }, [showActionSheetWithOptions, markAsPlayedStatus]);

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
          const url = itemRouter(item, from);
          // @ts-expect-error
          router.push(url);
        }}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
};
