import ArtistPoster from "@/components/ArtistPoster";
import { Chromecast } from "@/components/Chromecast";
import { Text } from "@/components/common/Text";
import { Loading } from "@/components/Loading";
import MoviePoster from "@/components/MoviePoster";
import { SongsList } from "@/components/music/SongsList";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { Ionicons } from "@expo/vector-icons";
import {
  BaseItemDto,
  BaseItemKind,
  ItemSortBy,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getArtistsApi,
  getItemsApi,
  getUserApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export default function page() {
  const searchParams = useLocalSearchParams();
  const { collectionId, artistId, albumId } = searchParams as {
    collectionId: string;
    artistId: string;
    albumId: string;
  };

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [startIndex, setStartIndex] = useState<number>(0);

  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="">
          <Chromecast />
        </View>
      ),
    });
  });

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

  if (!album) return null;

  return (
    <ScrollView>
      <View className="px-4 pb-24">
        <View className="flex flex-row space-x-4 items-start mb-4">
          <View className="w-24">
            <ArtistPoster item={album} />
          </View>
          <View className="flex flex-col shrink">
            <Text className="font-bold text-3xl">{album?.Name}</Text>
            <Text className="">{album?.ProductionYear}</Text>
          </View>
        </View>
        <SongsList
          albumId={albumId}
          songs={songs?.Items}
          collectionId={collectionId}
          artistId={artistId}
        />
      </View>
    </ScrollView>
  );
}
