import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const HERO_ITEMS_LIMIT = 15;

/**
 * Shared Continue Watching + Next Up fetch for the home hero carousel, used
 * by both Home.tsx and Home.tv.tsx. Keeping this on one query key
 * (["home", "heroItems", userId]) is what lets WebSocketProvider's
 * UserDataChanged invalidation reach both platforms instead of only one.
 */
export const useHeroItems = (enabled = true) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  return useQuery({
    queryKey: ["home", "heroItems", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const [resumeResponse, nextUpResponse] = await Promise.all([
        getItemsApi(api).getResumeItems({
          userId: user.Id,
          enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
          includeItemTypes: ["Movie", "Series", "Episode"],
          fields: ["Overview", "Genres"],
          startIndex: 0,
          limit: 10,
        }),
        getTvShowsApi(api).getNextUp({
          userId: user.Id,
          startIndex: 0,
          limit: 10,
          fields: ["Overview", "Genres"],
          enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
          enableResumable: false,
        }),
      ]);

      const resumeItems = resumeResponse.data.Items || [];
      const nextUpItems = nextUpResponse.data.Items || [];

      // Combine, sort by recent activity, and dedupe
      const combined = [...resumeItems, ...nextUpItems];
      const sorted = combined.sort((a, b) => {
        const dateA = a.UserData?.LastPlayedDate || a.DateCreated || "";
        const dateB = b.UserData?.LastPlayedDate || b.DateCreated || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      const seen = new Set<string>();
      const deduped: BaseItemDto[] = [];
      for (const item of sorted) {
        if (!item.Id || seen.has(item.Id)) continue;
        seen.add(item.Id);
        deduped.push(item);
      }

      return deduped.slice(0, HERO_ITEMS_LIMIT);
    },
    enabled: !!api && !!user?.Id && enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
};
