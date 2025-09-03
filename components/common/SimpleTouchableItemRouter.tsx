import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter, useSegments } from "expo-router";
import { type PropsWithChildren } from "react";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";

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

/**
 * Simplified TouchableItemRouter that doesn't use hooks that might trigger API calls.
 * Intended for use in similar items rows where we want to avoid unnecessary requests.
 */
export const SimpleTouchableItemRouter: React.FC<PropsWithChildren<Props>> = ({
  item,
  isOffline = false,
  children,
  ...props
}) => {
  const router = useRouter();
  const segments = useSegments();
  const from = segments[2] || "(home)";

  if (
    from === "(home)" ||
    from === "(search)" ||
    from === "(libraries)" ||
    from === "(favorites)"
  )
    return (
      <TouchableOpacity
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
