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
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

const ITEM_GAP = 16;
const SCALE_PADDING = 20;

const TVItemCardText: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  return (
    <View style={{ marginTop: 12, flexDirection: "column" }}>
      <Text numberOfLines={1} style={{ fontSize: 16, color: "#FFFFFF" }}>
        {item.Name}
      </Text>
      <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 2 }}>
        {item.ProductionYear}
      </Text>
    </View>
  );
};

interface WatchlistSectionProps extends ViewProps {
  watchlist: StreamystatsWatchlist;
  jellyfinServerId: string;
}

const WatchlistSection: React.FC<WatchlistSectionProps> = ({
  watchlist,
  jellyfinServerId,
  ...props
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";

  const { data: items, isLoading } = useQuery({
    queryKey: [
      "streamystats",
      "watchlist",
      watchlist.id,
      jellyfinServerId,
      settings?.streamyStatsServerUrl,
    ],
    queryFn: async (): Promise<BaseItemDto[]> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken || !user?.Id) {
        return [];
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const watchlistDetail = await streamystatsApi.getWatchlistItemIds({
        watchlistId: watchlist.id,
        jellyfinServerId,
      });

      const itemIds = watchlistDetail.data?.items;
      if (!itemIds?.length) {
        return [];
      }

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        ids: itemIds,
        fields: ["PrimaryImageAspectRatio", "Genres"],
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
      });

      return response.data.Items || [];
    },
    enabled:
      Boolean(settings?.streamyStatsServerUrl) &&
      Boolean(api?.accessToken) &&
      Boolean(user?.Id),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

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
            hasTVPreferredFocus={false}
          >
            {item.Type === "Movie" && <MoviePoster item={item} />}
            {item.Type === "Series" && <SeriesPoster item={item} />}
          </TVFocusablePoster>
          <TVItemCardText item={item} />
        </View>
      );
    },
    [handleItemPress],
  );

  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <View style={{ overflow: "visible" }} {...props}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "600",
          color: "#FFFFFF",
          marginBottom: 16,
          marginLeft: SCALE_PADDING,
        }}
      >
        {watchlist.name}
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

interface StreamystatsPromotedWatchlistsProps extends ViewProps {
  enabled?: boolean;
}

export const StreamystatsPromotedWatchlists: React.FC<
  StreamystatsPromotedWatchlistsProps
> = ({ enabled = true, ...props }) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();

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
    data: watchlists,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      "streamystats",
      "promotedWatchlists",
      jellyfinServerId,
      settings?.streamyStatsServerUrl,
    ],
    queryFn: async (): Promise<StreamystatsWatchlist[]> => {
      if (
        !settings?.streamyStatsServerUrl ||
        !api?.accessToken ||
        !jellyfinServerId
      ) {
        return [];
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.getPromotedWatchlists({
        jellyfinServerId,
        includePreview: false,
      });

      return response.data || [];
    },
    enabled:
      enabled &&
      streamyStatsEnabled &&
      Boolean(api?.accessToken) &&
      Boolean(jellyfinServerId) &&
      Boolean(user?.Id),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  if (!streamyStatsEnabled) return null;
  if (isError) return null;
  if (!isLoading && (!watchlists || watchlists.length === 0)) return null;

  if (isLoading) {
    return (
      <View style={{ overflow: "visible" }} {...props}>
        <View
          style={{
            height: 16,
            width: 128,
            backgroundColor: "#262626",
            borderRadius: 4,
            marginLeft: SCALE_PADDING,
            marginBottom: 16,
          }}
        />
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
      </View>
    );
  }

  return (
    <>
      {watchlists?.map((watchlist) => (
        <WatchlistSection
          key={watchlist.id}
          watchlist={watchlist}
          jellyfinServerId={jellyfinServerId!}
          {...props}
        />
      ))}
    </>
  );
};
