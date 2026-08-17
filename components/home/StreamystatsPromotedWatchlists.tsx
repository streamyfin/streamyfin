import type {
  BaseItemDto,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

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
  const { t } = useTranslation();

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
    refetchOnWindowFocus: false,
  });

  const handleSeeAll = () => {
    router.push({
      pathname: "/(auth)/(tabs)/(watchlists)/[watchlistId]",
      params: { watchlistId: watchlist.id.toString() },
    } as any);
  };

  if (!isLoading && (!items || items.length === 0)) return null;

  return (
    <CardRow
      {...props}
      title={watchlist.name}
      seeAllLabel={t("common.seeAll", { defaultValue: "See all" })}
      onPressSeeAll={handleSeeAll}
      kind='portrait'
      items={items ?? []}
      loading={isLoading}
    />
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
