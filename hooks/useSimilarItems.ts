import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import {
  SIMILAR_ITEMS_LIMIT,
  SIMILAR_ITEMS_SOURCE_TYPES,
} from "@/constants/Recommendations";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

/**
 * The items the server considers similar to a movie or a series, in the
 * server's order. Any other kind of item has none, and nothing is asked.
 */
export const useSimilarItems = (
  item: Pick<BaseItemDto, "Id" | "Type"> | null | undefined,
) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const itemId = item?.Id;
  const type = item?.Type;
  const hasSimilarItems = !!type && SIMILAR_ITEMS_SOURCE_TYPES.includes(type);

  return useQuery<BaseItemDto[]>({
    // The limit is part of the key: a list cached under a smaller limit never
    // goes stale, and would otherwise be served in place of the longer one.
    queryKey: ["similarItems", itemId, SIMILAR_ITEMS_LIMIT],
    queryFn: async () => {
      if (!api || !user?.Id || !itemId) return [];
      const response = await getLibraryApi(api).getSimilarItems({
        itemId,
        userId: user.Id,
        limit: SIMILAR_ITEMS_LIMIT,
      });

      // A series gets series and a movie gets movies. Jellyfin 12 answers
      // that way by itself; an older server mixes trailers and live TV
      // programmes into a movie's list.
      return (response.data.Items ?? []).filter(
        (similar) => similar.Type === type,
      );
    },
    enabled: !!api && !!user?.Id && !!itemId && hasSimilarItems,
    staleTime: Number.POSITIVE_INFINITY,
  });
};
