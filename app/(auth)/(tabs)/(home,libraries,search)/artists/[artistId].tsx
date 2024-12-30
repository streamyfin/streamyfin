import ArtistPoster from "@/components/posters/ArtistPoster";
import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { FlatList, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";

export default function page() {
  const searchParams = useLocalSearchParams();
  const { artistId } = searchParams as {
    artistId: string;
  };

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const navigation = useNavigation();

  const [startIndex, setStartIndex] = useState<number>(0);

  const { data: artist } = useQuery({
    queryKey: ["album", artistId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        ids: [artistId],
      });
      const data = response.data.Items?.[0];
      return data;
    },
    enabled: !!api && !!user?.Id && !!artistId,
    staleTime: 0,
  });

  const {
    data: albums,
    isLoading,
    isError,
  } = useQuery<{
    Items: BaseItemDto[];
    TotalRecordCount: number;
  }>({
    queryKey: ["albums", artistId, startIndex],
    queryFn: async () => {
      if (!api)
        return {
          Items: [],
          TotalRecordCount: 0,
        };

      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        parentId: artistId,
        sortOrder: ["Descending", "Descending", "Ascending"],
        includeItemTypes: ["MusicAlbum"],
        recursive: true,
        fields: [
          "ParentId",
          "PrimaryImageAspectRatio",
          "ParentId",
          "PrimaryImageAspectRatio",
        ],
        collapseBoxSetItems: false,
        albumArtistIds: [artistId],
        startIndex,
        limit: 100,
        sortBy: ["PremiereDate", "ProductionYear", "SortName"],
      });

      const data = response.data.Items;

      return {
        Items: data || [],
        TotalRecordCount: response.data.TotalRecordCount || 0,
      };
    },
    enabled: !!api && !!user?.Id,
  });

  const insets = useSafeAreaInsets();

  if (!artist || !albums) return null;

  return (
    <ParallaxScrollView
      headerHeight={400}
      headerImage={
        <ItemImage
          variant={"Primary"}
          item={artist}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      }
    >
      <View className="px-4 mb-8">
        <Text className="font-bold text-2xl mb-2">{artist?.Name}</Text>
        <Text className="text-neutral-500">
          {albums.TotalRecordCount} albums
        </Text>
      </View>
      <View className="flex flex-row flex-wrap justify-between px-4">
        {albums.Items.map((item, idx) => (
          <TouchableItemRouter
            item={item}
            style={{ width: "30%", marginBottom: 20 }}
            key={idx}
          >
            <View className="flex flex-col gap-y-2">
              <ArtistPoster item={item} />
              <Text numberOfLines={2}>{item.Name}</Text>
              <Text className="opacity-50 text-xs">{item.ProductionYear}</Text>
            </View>
          </TouchableItemRouter>
        ))}
      </View>
    </ParallaxScrollView>
  );
}
