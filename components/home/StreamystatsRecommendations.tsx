import type {
  BaseItemDto,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import type { ViewProps } from "react-native";

import { CardRow } from "@/components/cards/CardRow";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type { StreamystatsRecommendationsIdsResponse } from "@/utils/streamystats/types";

interface Props extends ViewProps {
  title: string;
  type: "Movie" | "Series";
  limit?: number;
  enabled?: boolean;
}

export const StreamystatsRecommendations: React.FC<Props> = ({
  title,
  type,
  limit = 20,
  enabled = true,
  ...props
}) => {
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
    staleTime: 60 * 60 * 1000, // 1 hour - server info rarely changes
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
    staleTime: 5 * 60 * 1000, // 5 minutes
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
    refetchOnWindowFocus: false,
  });

  const isLoading = isLoadingRecommendations || isLoadingItems;
  const isError = isRecommendationsError || isItemsError;

  if (!streamyStatsEnabled) return null;
  if (isError) return null;
  return (
    <CardRow
      {...props}
      title={title}
      kind='portrait'
      items={items ?? []}
      loading={isLoading}
      hideIfEmpty
    />
  );
};
