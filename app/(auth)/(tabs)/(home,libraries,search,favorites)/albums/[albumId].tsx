import { Chromecast } from "@/components/Chromecast";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { SongsList } from "@/components/music/SongsList";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import ArtistPoster from "@/components/posters/ArtistPoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function page() {
  const searchParams = useLocalSearchParams();
  const { collectionId, artistId, albumId } = searchParams as {
    collectionId: string;
    artistId: string;
    albumId: string;
  };

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const navigation = useNavigation();

  if (!Platform.isTV) {
    useEffect(() => {
      navigation.setOptions({
        headerRight: () => (
          <View className="">
            <Chromecast />
          </View>
        ),
      });
    });
  }

  const { data: album } = useQuery({
    queryKey: ["album", albumId, artistId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        ids: [albumId],
      });
      const data = response.data.Items?.[0];
      return data;
    },
    enabled: !!api && !!user?.Id && !!albumId,
    staleTime: 0,
  });

  const {
    data: songs,
    isLoading,
    isError,
  } = useQuery<{
    Items: BaseItemDto[];
    TotalRecordCount: number;
  }>({
    queryKey: ["songs", artistId, albumId],
    queryFn: async () => {
      if (!api)
        return {
          Items: [],
          TotalRecordCount: 0,
        };

      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        parentId: albumId,
        fields: [
          "ItemCounts",
          "PrimaryImageAspectRatio",
          "CanDelete",
          "MediaSourceCount",
        ],
        sortBy: ["ParentIndexNumber", "IndexNumber", "SortName"],
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

  if (!album) return null;

  return (
    <ParallaxScrollView
      headerHeight={400}
      headerImage={
        <ItemImage
          variant={"Primary"}
          item={album}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      }
    >
      <View className="px-4 mb-8">
        <Text className="font-bold text-2xl mb-2">{album?.Name}</Text>
        <Text className="text-neutral-500">
          {songs?.TotalRecordCount} songs
        </Text>
      </View>
      <View className="px-4">
        <SongsList
          albumId={albumId}
          songs={songs?.Items}
          collectionId={collectionId}
          artistId={artistId}
        />
      </View>
    </ParallaxScrollView>
  );
}
