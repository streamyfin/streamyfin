import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
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
import { type TouchableOpacityProps, View } from "react-native";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

interface Props extends TouchableOpacityProps {
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
export const LibraryItemCard: React.FC<Props> = ({ library, ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [settings] = useSettings();

  const { t } = useTranslation();

  const url = useMemo(
    () =>
      getPrimaryImageUrl({
        api,
        item: library,
      }),
    [library],
  );

  const itemType = useMemo(() => {
    let _itemType: BaseItemKind | undefined;

    if (library.CollectionType === "movies") {
      _itemType = "Movie";
    } else if (library.CollectionType === "tvshows") {
      _itemType = "Series";
    } else if (library.CollectionType === "boxsets") {
      _itemType = "BoxSet";
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
  }, [library.CollectionType]);

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
  });

  if (!url) return null;

  if (settings?.libraryOptions?.display === "row") {
    return (
      <TouchableItemRouter item={library} className='w-full px-4'>
        <View className='flex flex-row items-center w-full relative '>
          <Ionicons
            name={icons[library.CollectionType!] || "folder"}
            size={22}
            color={"#e5e5e5"}
          />
          <Text className='text-start px-4 text-neutral-200'>
            {library.Name}
          </Text>
          {settings?.libraryOptions?.showStats && (
            <Text className='font-bold text-xs text-neutral-500 text-start ml-auto'>
              {itemsCount} {itemTypeName}
            </Text>
          )}
        </View>
      </TouchableItemRouter>
    );
  }

  if (settings?.libraryOptions?.imageStyle === "cover") {
    return (
      <TouchableItemRouter item={library} className='w-full'>
        <View className='flex justify-center rounded-xl w-full relative border border-neutral-900 h-20 '>
          <View
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 8,
              position: "absolute",
              top: 0,
              left: 0,
              overflow: "hidden",
            }}
          >
            <Image
              source={{ uri: url }}
              style={{
                width: "100%",
                height: "100%",
              }}
              cachePolicy={"memory-disk"}
            />
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.3)", // Adjust the alpha value (0.3) to control darkness
              }}
            />
          </View>
          {settings?.libraryOptions?.showTitles && (
            <Text className='font-bold text-lg text-start px-4'>
              {library.Name}
            </Text>
          )}
          {settings?.libraryOptions?.showStats && (
            <Text className='font-bold text-xs  text-start px-4'>
              {itemsCount} {itemTypeName}
            </Text>
          )}
        </View>
      </TouchableItemRouter>
    );
  }

  return (
    <TouchableItemRouter item={library} {...props}>
      <View className='flex flex-row items-center justify-between rounded-xl w-full relative border bg-neutral-900 border-neutral-900 h-20'>
        <View className='flex flex-col'>
          <Text className='font-bold text-lg text-start px-4'>
            {library.Name}
          </Text>
          {settings?.libraryOptions?.showStats && (
            <Text className='font-bold text-xs text-neutral-500 text-start px-4'>
              {itemsCount} {itemTypeName}
            </Text>
          )}
        </View>
        <View className='p-2'>
          <Image
            source={{ uri: url }}
            className='h-full aspect-[2/1] object-cover rounded-lg overflow-hidden'
          />
        </View>
      </View>
    </TouchableItemRouter>
  );
};
