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
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { scaleSize } from "@/utils/scaleSize";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsRecommendationsIdsResponse } from "@/utils/streamystats/types";

interface Props extends ViewProps {
  title: string;
  type: "Movie" | "Series";
  limit?: number;
  enabled?: boolean;
  onItemFocus?: (item: BaseItemDto) => void;
}

export const StreamystatsRecommendations: React.FC<Props> = ({
  title,
  type,
  limit = 20,
  enabled = true,
  onItemFocus,
  ...props
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
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
      length: sizes.posters.poster + sizes.gaps.item,
      offset: (sizes.posters.poster + sizes.gaps.item) * index,
      index,
    }),
    [sizes],
  );

  const renderItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      return (
        <View style={{ marginRight: sizes.gaps.item }}>
          <TVPosterCard
            item={item}
            orientation='vertical'
            onPress={() => handleItemPress(item)}
            onLongPress={() => showItemActions(item)}
            onFocus={() => onItemFocus?.(item)}
            width={sizes.posters.poster}
          />
        </View>
      );
    },
    [sizes, handleItemPress, showItemActions, onItemFocus],
  );

  if (!streamyStatsEnabled) return null;
  if (isError) return null;
  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <View style={{ overflow: "visible" }} {...props}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "700",
          color: "#FFFFFF",
          marginBottom: 20,
          marginLeft: sizes.padding.horizontal,
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>

      {isLoading ? (
        <View
          style={{
            flexDirection: "row",
            gap: sizes.gaps.item,
            paddingLeft: sizes.padding.horizontal,
            paddingRight: sizes.padding.horizontal,
            paddingVertical: sizes.padding.scale,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: sizes.posters.poster }}>
              <View
                style={{
                  backgroundColor: "#262626",
                  width: sizes.posters.poster,
                  aspectRatio: 10 / 15,
                  borderRadius: scaleSize(24),
                }}
              />
              <View
                style={{
                  marginTop: scaleSize(12),
                  paddingHorizontal: scaleSize(4),
                  borderRadius: 6,
                  overflow: "hidden",
                  marginBottom: 4,
                  alignSelf: "flex-start",
                }}
              >
                <Text
                  style={{
                    color: "#262626",
                    backgroundColor: "#262626",
                    borderRadius: 6,
                    fontSize: typography.callout,
                  }}
                  numberOfLines={1}
                >
                  Placeholder text here
                </Text>
              </View>
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
          contentInset={{
            left: sizes.padding.horizontal,
            right: sizes.padding.horizontal,
          }}
          contentOffset={{ x: -sizes.padding.horizontal, y: 0 }}
          contentContainerStyle={{
            paddingVertical: sizes.padding.scale,
          }}
        />
      )}
    </View>
  );
};
