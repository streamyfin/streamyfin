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
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { scaleSize } from "@/utils/scaleSize";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

const SCALE_PADDING = scaleSize(20);

interface WatchlistSectionProps extends ViewProps {
  watchlist: StreamystatsWatchlist;
  jellyfinServerId: string;
  onItemFocus?: (item: BaseItemDto) => void;
}

const WatchlistSection: React.FC<WatchlistSectionProps> = ({
  watchlist,
  jellyfinServerId,
  onItemFocus,
  ...props
}) => {
  const typography = useScaledTVTypography();
  const posterSizes = useScaledTVPosterSizes();
  const sizes = useScaledTVSizes();
  const ITEM_GAP = sizes.gaps.item;
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
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
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
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
      length: posterSizes.poster + ITEM_GAP,
      offset: (posterSizes.poster + ITEM_GAP) * index,
      index,
    }),
    [posterSizes.poster, ITEM_GAP],
  );

  const renderItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      return (
        <View style={{ marginRight: ITEM_GAP }}>
          <TVPosterCard
            item={item}
            orientation='vertical'
            onPress={() => handleItemPress(item)}
            onLongPress={() => showItemActions(item)}
            onFocus={() => onItemFocus?.(item)}
            width={posterSizes.poster}
          />
        </View>
      );
    },
    [
      ITEM_GAP,
      posterSizes.poster,
      handleItemPress,
      showItemActions,
      onItemFocus,
    ],
  );

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
        {watchlist.name}
      </Text>

      {isLoading ? (
        <View
          style={{
            flexDirection: "row",
            gap: ITEM_GAP,
            paddingLeft: sizes.padding.horizontal,
            paddingRight: sizes.padding.horizontal,
            paddingVertical: SCALE_PADDING,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: posterSizes.poster }}>
              <View
                style={{
                  backgroundColor: "#262626",
                  width: posterSizes.poster,
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
            paddingVertical: SCALE_PADDING,
          }}
        />
      )}
    </View>
  );
};

interface StreamystatsPromotedWatchlistsProps extends ViewProps {
  enabled?: boolean;
  onItemFocus?: (item: BaseItemDto) => void;
}

export const StreamystatsPromotedWatchlists: React.FC<
  StreamystatsPromotedWatchlistsProps
> = ({ enabled = true, onItemFocus, ...props }) => {
  const posterSizes = useScaledTVPosterSizes();
  const sizes = useScaledTVSizes();
  const ITEM_GAP = sizes.gaps.item;
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const typography = useScaledTVTypography();

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
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
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
            height: scaleSize(16),
            width: scaleSize(128),
            backgroundColor: "#262626",
            borderRadius: scaleSize(4),
            marginLeft: sizes.padding.horizontal,
            marginBottom: scaleSize(20),
          }}
        />
        <View
          style={{
            flexDirection: "row",
            gap: ITEM_GAP,
            paddingLeft: sizes.padding.horizontal,
            paddingRight: sizes.padding.horizontal,
            paddingVertical: SCALE_PADDING,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: posterSizes.poster }}>
              <View
                style={{
                  backgroundColor: "#262626",
                  width: posterSizes.poster,
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
          onItemFocus={onItemFocus}
          {...props}
        />
      ))}
    </>
  );
};
