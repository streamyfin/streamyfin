import type {
  BaseItemDto,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { FlatList, View, type ViewProps } from "react-native";

import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import MoviePoster, {
  TV_POSTER_WIDTH,
} from "@/components/posters/MoviePoster.tv";
import SeriesPoster from "@/components/posters/SeriesPoster.tv";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { TVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsRecommendationsIdsResponse } from "@/utils/streamystats/types";

const ITEM_GAP = 16;
const SCALE_PADDING = 20;

interface Props extends ViewProps {
  title: string;
  type: "Movie" | "Series";
  limit?: number;
  enabled?: boolean;
  onItemFocus?: (item: BaseItemDto) => void;
}

const TVItemCardText: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  return (
    <View style={{ marginTop: 12, flexDirection: "column" }}>
      <Text
        numberOfLines={1}
        style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
      >
        {item.Name}
      </Text>
      <Text
        style={{
          fontSize: TVTypography.callout,
          color: "#9CA3AF",
          marginTop: 2,
        }}
      >
        {item.ProductionYear}
      </Text>
    </View>
  );
};

export const StreamystatsRecommendations: React.FC<Props> = ({
  title,
  type,
  limit = 20,
  enabled = true,
  onItemFocus,
  ...props
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";

  const streamyStatsEnabled = useMemo(() => {
    return Boolean(settings?.streamyStatsServerUrl);
  }, [settings?.streamyStatsServerUrl]);

  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      const response = await getSystemApi(api).getPublicSystemInfo();
      return response.data;
    },
    enabled: enabled && Boolean(api) && streamyStatsEnabled,
    staleTime: 60 * 60 * 1000,
  });

  const jellyfinServerId = serverInfo?.Id;

  const {
    data: recommendationIds,
    isLoading: isLoadingRecommendations,
    isError: isRecommendationsError,
  } = useQuery({
    queryKey: [
      "streamystats",
      "recommendations",
      type,
      jellyfinServerId,
      settings?.streamyStatsServerUrl,
    ],
    queryFn: async (): Promise<string[]> => {
      if (
        !settings?.streamyStatsServerUrl ||
        !api?.accessToken ||
        !jellyfinServerId
      ) {
        return [];
      }

      const streamyStatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamyStatsApi.getRecommendationIds(
        jellyfinServerId,
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
      enabled &&
      streamyStatsEnabled &&
      Boolean(api?.accessToken) &&
      Boolean(jellyfinServerId) &&
      Boolean(user?.Id),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
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
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLoading = isLoadingRecommendations || isLoadingItems;
  const isError = isRecommendationsError || isItemsError;

  const handleItemPress = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<BaseItemDto> | null | undefined, index: number) => ({
      length: TV_POSTER_WIDTH + ITEM_GAP,
      offset: (TV_POSTER_WIDTH + ITEM_GAP) * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      return (
        <View style={{ marginRight: ITEM_GAP, width: TV_POSTER_WIDTH }}>
          <TVFocusablePoster
            onPress={() => handleItemPress(item)}
            onFocus={() => onItemFocus?.(item)}
            hasTVPreferredFocus={false}
          >
            {item.Type === "Movie" && <MoviePoster item={item} />}
            {item.Type === "Series" && <SeriesPoster item={item} />}
          </TVFocusablePoster>
          <TVItemCardText item={item} />
        </View>
      );
    },
    [handleItemPress, onItemFocus],
  );

  if (!streamyStatsEnabled) return null;
  if (isError) return null;
  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <View style={{ overflow: "visible" }} {...props}>
      <Text
        style={{
          fontSize: TVTypography.heading,
          fontWeight: "700",
          color: "#FFFFFF",
          marginBottom: 20,
          marginLeft: SCALE_PADDING,
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>

      {isLoading ? (
        <View
          style={{
            flexDirection: "row",
            gap: ITEM_GAP,
            paddingHorizontal: SCALE_PADDING,
            paddingVertical: SCALE_PADDING,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: TV_POSTER_WIDTH }}>
              <View
                style={{
                  backgroundColor: "#262626",
                  width: TV_POSTER_WIDTH,
                  aspectRatio: 10 / 15,
                  borderRadius: 12,
                  marginBottom: 8,
                }}
              />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.Id!}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={5}
          maxToRenderPerBatch={3}
          windowSize={5}
          removeClippedSubviews={false}
          getItemLayout={getItemLayout}
          style={{ overflow: "visible" }}
          contentContainerStyle={{
            paddingVertical: SCALE_PADDING,
            paddingHorizontal: SCALE_PADDING,
          }}
        />
      )}
    </View>
  );
};
