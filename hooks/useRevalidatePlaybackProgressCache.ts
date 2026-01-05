import { useQueryClient } from "@tanstack/react-query";
import { useDownload } from "@/providers/DownloadProvider";
import { useTwoWaySync } from "./useTwoWaySync";

// PERFORMANCE: Only sync items played in the last 7 days to avoid syncing 100s of items
const SYNC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * useRevalidatePlaybackProgressCache invalidates queries related to playback progress.
 */
export function useInvalidatePlaybackProgressCache() {
  const queryClient = useQueryClient();
  const { downloadedItems } = useDownload();
  const { syncPlaybackState } = useTwoWaySync();

  const revalidate = async () => {
    // List of all the queries to invalidate
    const queriesToInvalidate = [
      ["item"],
      ["resumeItems"],
      ["continueWatching"],
      ["nextUp-all"],
      ["nextUp"],
      ["episodes"],
      ["seasons"],
      ["home"],
      ["downloadedItems"],
    ];

    // We Invalidate all the queries to the latest server versions
    await Promise.all(
      queriesToInvalidate.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

    // PERFORMANCE FIX: Only sync recently watched items instead of ALL downloads
    // This prevents making 500+ API requests for users with many downloads
    if (downloadedItems && downloadedItems.length > 0) {
      const now = Date.now();
      const recentlyWatchedItems = downloadedItems.filter((downloadedItem) => {
        const lastPlayedDate = downloadedItem.item.UserData?.LastPlayedDate;
        if (!lastPlayedDate) return false;

        const lastPlayedTime = new Date(lastPlayedDate).getTime();
        return now - lastPlayedTime <= SYNC_WINDOW_MS;
      });

      console.log(
        `[Performance] Syncing ${recentlyWatchedItems.length} recently watched items (out of ${downloadedItems.length} total downloads)`,
      );

      if (recentlyWatchedItems.length > 0) {
        // We sync the playback state for recently watched downloaded items only
        const syncResults = await Promise.all(
          recentlyWatchedItems.map((downloadedItem) =>
            syncPlaybackState(downloadedItem.item.Id!),
          ),
        );
        // We invalidate the queries again in case we have updated a server's playback progress.
        const shouldInvalidate = syncResults.some((result) => result);

        console.log("shouldInvalidate", shouldInvalidate);
        if (shouldInvalidate) {
          queriesToInvalidate.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          );
        }
      }
    }
  };

  return revalidate;
}
