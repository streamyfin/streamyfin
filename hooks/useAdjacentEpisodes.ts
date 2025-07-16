import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom } from "@/providers/JellyfinProvider";

interface AdjacentEpisodesProps {
  item?: BaseItemDto | null;
  isOffline?: boolean;
}

export const useAdjacentItems = ({
  item,
  isOffline = false,
}: AdjacentEpisodesProps) => {
  const api = useAtomValue(apiAtom);
  const { downloadedFiles } = useDownload();

  const { data: adjacentItems } = useQuery({
    queryKey: ["adjacentItems", item?.Id, item?.SeriesId, isOffline],
    queryFn: async (): Promise<BaseItemDto[] | null> => {
      if (!item || !item.SeriesId) {
        return null;
      }

      if (isOffline) {
        if (!downloadedFiles) return null;
        const seriesEpisodes = downloadedFiles
          .filter((f) => f.item.SeriesId === item.SeriesId)
          .map((f) => f.item);

        seriesEpisodes.sort((a, b) => {
          if (a.ParentIndexNumber !== b.ParentIndexNumber) {
            return (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0);
          }
          return (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
        });

        const currentIndex = seriesEpisodes.findIndex(
          (ep) => ep.Id === item.Id,
        );

        if (currentIndex === -1) {
          return null;
        }

        const result: BaseItemDto[] = [];
        if (currentIndex > 0) {
          result.push(seriesEpisodes[currentIndex - 1]);
        }
        result.push(seriesEpisodes[currentIndex]);
        if (currentIndex < seriesEpisodes.length - 1) {
          result.push(seriesEpisodes[currentIndex + 1]);
        }
        return result;
      }

      if (!api) {
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
      (isOffline || !!api) &&
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
