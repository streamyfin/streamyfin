import { apiAtom } from "@/providers/JellyfinProvider";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

interface AdjacentEpisodesProps {
  item?: BaseItemDto | null;
}

export const useAdjacentItems = ({ item }: AdjacentEpisodesProps) => {
  const api = useAtomValue(apiAtom);

  const { data: adjacentItems } = useQuery({
    queryKey: ["adjacentItems", item?.Id, item?.SeriesId],
    queryFn: async (): Promise<BaseItemDto[] | null> => {
      if (!api || !item || !item.SeriesId) {
        return null;
      }

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.SeriesId,
        adjacentTo: item.Id,
        limit: 3,
        fields: ["MediaSources", "MediaStreams", "ParentId"],
      });

      return res.data.Items || null;
    },
    enabled:
      !!api &&
      !!item?.Id &&
      !!item?.SeriesId &&
      (item?.Type === "Episode" || item?.Type === "Audio"),
    staleTime: 0,
  });

  const previousItem = useMemo(() => {
    if (!adjacentItems || adjacentItems.length <= 1) {
      return null;
    }

    if (adjacentItems.length === 2) {
      return adjacentItems[0].Id === item?.Id ? null : adjacentItems[0];
    }

    return adjacentItems[0];
  }, [adjacentItems, item]);

  const nextItem = useMemo(() => {
    if (!adjacentItems || adjacentItems.length <= 1) {
      return null;
    }

    if (adjacentItems.length === 2) {
      return adjacentItems[1].Id === item?.Id ? null : adjacentItems[1];
    }

    return adjacentItems[2];
  }, [adjacentItems, item]);

  return { previousItem, nextItem };
};
