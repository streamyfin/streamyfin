import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemKind,
  CollectionType,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

export const TV_LIBRARY_CARD_WIDTH = 280;
export const TV_LIBRARY_CARD_HEIGHT = 180;

interface Props {
  library: BaseItemDto;
}

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const icons: Record<CollectionType, IconName> = {
  movies: "film",
  tvshows: "tv",
  music: "musical-notes",
  books: "book",
  homevideos: "videocam",
  boxsets: "albums",
  playlists: "list",
  folders: "folder",
  livetv: "tv",
  musicvideos: "musical-notes",
  photos: "images",
  trailers: "videocam",
  unknown: "help-circle",
} as const;

export const TVLibraryCard: React.FC<Props> = ({ library }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  const url = useMemo(
    () =>
      getPrimaryImageUrl({
        api,
        item: library,
      }),
    [api, library],
  );

  const itemType = useMemo(() => {
    let _itemType: BaseItemKind | undefined;

    if (library.CollectionType === "movies") {
      _itemType = "Movie";
    } else if (library.CollectionType === "tvshows") {
      _itemType = "Series";
    } else if (library.CollectionType === "boxsets") {
      _itemType = "BoxSet";
    } else if (library.CollectionType === "homevideos") {
      _itemType = "Video";
    } else if (library.CollectionType === "musicvideos") {
      _itemType = "MusicVideo";
    }

    return _itemType;
  }, [library.CollectionType]);

  const itemTypeName = useMemo(() => {
    let nameStr: string;

    if (library.CollectionType === "movies") {
      nameStr = t("library.item_types.movies");
    } else if (library.CollectionType === "tvshows") {
      nameStr = t("library.item_types.series");
    } else if (library.CollectionType === "boxsets") {
      nameStr = t("library.item_types.boxsets");
    } else {
      nameStr = t("library.item_types.items");
    }

    return nameStr;
  }, [library.CollectionType, t]);

  const { data: itemsCount } = useQuery({
    queryKey: ["library-count", library.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: library.Id,
        recursive: true,
        limit: 0,
        includeItemTypes: itemType ? [itemType] : undefined,
      });
      return response.data.TotalRecordCount;
    },
    enabled: !!api && !!user?.Id && !!library.Id,
  });

  const iconName = icons[library.CollectionType!] || "folder";

  return (
    <View
      style={{
        width: TV_LIBRARY_CARD_WIDTH,
        height: TV_LIBRARY_CARD_HEIGHT,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
        borderWidth: 1,
        borderColor: "#333",
      }}
    >
      {url && (
        <Image
          source={{ uri: url }}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
          }}
          cachePolicy='memory-disk'
        />
      )}
      <View
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          backgroundColor: url ? "rgba(0, 0, 0, 0.6)" : "transparent",
        }}
      />
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Ionicons name={iconName} size={48} color='#e5e5e5' />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 22,
            fontWeight: "600",
            color: "#FFFFFF",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          {library.Name}
        </Text>
        {itemsCount !== undefined && (
          <Text
            style={{
              fontSize: 14,
              color: "#9CA3AF",
              marginTop: 4,
            }}
          >
            {itemsCount} {itemTypeName}
          </Text>
        )}
      </View>
    </View>
  );
};
