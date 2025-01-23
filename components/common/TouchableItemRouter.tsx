import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter, useSegments } from "expo-router";
import { PropsWithChildren } from "react";
import { TouchableOpacity, TouchableOpacityProps } from "react-native";

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

  if (item.Type === "MusicAlbum") {
    return `/(auth)/(tabs)/${from}/albums/${item.Id}`;
  }

  if (item.Type === "Audio") {
    return `/(auth)/(tabs)/${from}/albums/${item.AlbumId}`;
  }

  if (item.Type === "MusicArtist") {
    return `/(auth)/(tabs)/${from}/artists/${item.Id}`;
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

  const from = segments[2];

  const markAsPlayedStatus = useMarkAsPlayed(item);

  if (
    from === "(home)" ||
    from === "(search)" ||
    from === "(libraries)" ||
    from === "(favorites)"
  )
    return (
      <TouchableOpacity
        onPress={() => {
          const url = itemRouter(item, from);
          // @ts-ignore
          router.push(url);
        }}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
};
