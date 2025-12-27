import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View, type ViewProps } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import MoviePoster from "@/components/posters/MoviePoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsRecommendationsIdsResponse } from "@/utils/streamystats/types";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";
import SeriesPoster from "../posters/SeriesPoster";

interface Props extends ViewProps {
  title: string;
  type: "Movie" | "Series";
  limit?: number;
}

export const StreamystatsRecommendations: React.FC<Props> = ({
  title,
  type,
  limit = 20,
  ...props
}) => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();

  const serverName = useMemo(() => {
    if (!api?.basePath) return null;
    try {
      const url = new URL(api.basePath);
      return url.hostname;
    } catch {
      return null;
    }
  }, [api?.basePath]);

  const streamyStatsEnabled = useMemo(() => {
    return Boolean(settings?.streamyStatsServerUrl);
  }, [settings?.streamyStatsServerUrl]);

  const {
    data: recommendationIds,
    isLoading: isLoadingRecommendations,
    isError: isRecommendationsError,
  } = useQuery({
    queryKey: [
      "streamystats",
      "recommendations",
      type,
      serverName,
      settings?.streamyStatsServerUrl,
    ],
    queryFn: async (): Promise<string[]> => {
      if (
        !settings?.streamyStatsServerUrl ||
        !api?.accessToken ||
        !serverName
      ) {
        return [];
      }

      const streamyStatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamyStatsApi.getRecommendationIds(
        serverName,
        type,
        limit,
      );

      const data = response as StreamystatsRecommendationsIdsResponse;

      if (type === "Movie") {
        return data.data.movies || [];
      }
      return data.data.series || [];
    },
    enabled:
      streamyStatsEnabled &&
      Boolean(api?.accessToken) &&
      Boolean(serverName) &&
      Boolean(user?.Id),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const {
    data: items,
    isLoading: isLoadingItems,
    isError: isItemsError,
  } = useQuery({
    queryKey: [
      "streamystats",
      "recommendations",
      "items",
      type,
      recommendationIds,
    ],
    queryFn: async (): Promise<BaseItemDto[]> => {
      if (!api || !user?.Id || !recommendationIds?.length) {
        return [];
      }

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        ids: recommendationIds,
        fields: ["PrimaryImageAspectRatio", "Genres"],
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
      });

      return response.data.Items || [];
    },
    enabled:
      Boolean(recommendationIds?.length) && Boolean(api) && Boolean(user?.Id),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const isLoading = isLoadingRecommendations || isLoadingItems;
  const isError = isRecommendationsError || isItemsError;

  if (!streamyStatsEnabled) return null;
  if (isError) return null;
  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <View {...props}>
      <SectionHeader title={title} />
      {isLoading ? (
        <View className='flex flex-row gap-2 px-4'>
          {[1, 2, 3].map((i) => (
            <View className='w-28' key={i}>
              <View className='bg-neutral-900 aspect-[2/3] w-full rounded-md mb-1' />
              <View className='rounded-md overflow-hidden mb-1 self-start'>
                <Text
                  className='text-neutral-900 bg-neutral-900 rounded-md'
                  numberOfLines={1}
                >
                  Loading title...
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className='px-4 flex flex-row'>
            {items?.map((item) => (
              <TouchableItemRouter
                item={item}
                key={item.Id}
                className='mr-2 w-28'
              >
                {item.Type === "Movie" && <MoviePoster item={item} />}
                {item.Type === "Series" && <SeriesPoster item={item} />}
                <ItemCardText item={item} />
              </TouchableItemRouter>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
