import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import ArtistPoster from "@/components/posters/ArtistPoster";
import MoviePoster from "@/components/posters/MoviePoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getArtistsApi, getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";

export default function page() {
  const searchParams = useLocalSearchParams();
  const { collectionId } = searchParams as { collectionId: string };

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data: collection } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        ids: [collectionId],
      });
      const data = response.data.Items?.[0];
      return data;
    },
    enabled: !!api && !!user?.Id && !!collectionId,
    staleTime: 0,
  });

  const [startIndex, setStartIndex] = useState<number>(0);

  const { data, isLoading, isError } = useQuery<{
    Items: BaseItemDto[];
    TotalRecordCount: number;
  }>({
    queryKey: ["collection-items", collection?.Id, startIndex],
    queryFn: async () => {
      if (!api || !collectionId)
        return {
          Items: [],
          TotalRecordCount: 0,
        };

      const response = await getArtistsApi(api).getArtists({
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        fields: ["PrimaryImageAspectRatio", "SortName"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        parentId: collectionId,
        userId: user?.Id,
      });

      const data = response.data.Items;

      return {
        Items: data || [],
        TotalRecordCount: response.data.TotalRecordCount || 0,
      };
    },
    enabled: !!collection?.Id && !!api && !!user?.Id,
  });

  const totalItems = useMemo(() => {
    return data?.TotalRecordCount;
  }, [data]);

  if (!data) return null;

  return (
    <FlatList
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 140,
      }}
      ListHeaderComponent={
        <View className="mb-4">
          <Text className="font-bold text-3xl mb-2">Artists</Text>
        </View>
      }
      nestedScrollEnabled
      data={data.Items}
      numColumns={3}
      columnWrapperStyle={{
        justifyContent: "space-between",
      }}
      renderItem={({ item, index }) => (
        <TouchableItemRouter
          style={{
            maxWidth: "30%",
            width: "100%",
          }}
          key={index}
          item={item}
        >
          <View className="flex flex-col gap-y-2">
            {collection?.CollectionType === "movies" && (
              <MoviePoster item={item} />
            )}
            {collection?.CollectionType === "music" && (
              <ArtistPoster item={item} />
            )}
            <Text>{item.Name}</Text>
            <Text className="opacity-50 text-xs">{item.ProductionYear}</Text>
          </View>
        </TouchableItemRouter>
      )}
      keyExtractor={(item) => item.Id || ""}
    />
  );
}
