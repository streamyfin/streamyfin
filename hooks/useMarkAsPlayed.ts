import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryKey, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { togglePlayState } from "@/utils/jellyfin/playstate/togglePlayState";
import { useHaptic } from "./useHaptic";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";

export const useMarkAsPlayed = (items: BaseItemDto[], isOffline = false) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const queryClient = useQueryClient();
  const lightHapticFeedback = useHaptic("light");
  const downloads = useDownload();
  const invalidatePlaybackProgressCache = useInvalidatePlaybackProgressCache();
  const invalidateQueries = async () => {
    const queriesToInvalidate: QueryKey[] = [];
    items.forEach((item) => {
      if (!item.Id) return;
      queriesToInvalidate.push(["item", item.Id]);
    });
    await Promise.all(
      queriesToInvalidate.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  const toggle = async (played: boolean) => {
    lightHapticFeedback();
    // Process all items
    await Promise.all(
      items.map((item) =>
        togglePlayState({
          api,
          item,
          userId: user?.Id,
          isOffline,
          downloads,
          played,
        }),
      ),
    );
    invalidatePlaybackProgressCache();
    invalidateQueries();
  };

  return toggle;
};
