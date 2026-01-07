import type {
  BaseItemDto,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { ScrollView, View, type ViewProps } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import MoviePoster from "@/components/posters/MoviePoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";
import SeriesPoster from "../posters/SeriesPoster";

const ITEM_WIDTH = 120; // w-28 (112px) + mr-2 (8px)

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

  const snapOffsets = useMemo(() => {
    return items?.map((_, index) => index * ITEM_WIDTH) ?? [];
  }, [items]);

  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <View {...props}>
      <SectionHeader title={watchlist.name} />
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
                  Loading...
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToOffsets={snapOffsets}
          decelerationRate='fast'
        >
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

  // Fetch server info to get the Jellyfin server ID
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
      <View {...props}>
        <View className='h-4 w-32 bg-neutral-900 rounded ml-4 mb-2' />
        <View className='flex flex-row gap-2 px-4'>
          {[1, 2, 3].map((i) => (
            <View className='w-28' key={i}>
              <View className='bg-neutral-900 aspect-[2/3] w-full rounded-md mb-1' />
              <View className='rounded-md overflow-hidden mb-1 self-start'>
                <Text
                  className='text-neutral-900 bg-neutral-900 rounded-md'
                  numberOfLines={1}
                >
                  Loading...
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
          {...props}
        />
      ))}
    </>
  );
};
