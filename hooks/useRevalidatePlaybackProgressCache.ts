import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useDownload } from "@/providers/DownloadProvider";
import { useTwoWaySync } from "./useTwoWaySync";

/**
 * useRevalidatePlaybackProgressCache invalidates queries related to playback progress.
 */
export function useInvalidatePlaybackProgressCache() {
  const queryClient = useNetworkAwareQueryClient();
  const { getDownloadedItems } = useDownload();
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

    const downloadedFiles = getDownloadedItems();
    // Sync playback state for downloaded items
    if (downloadedFiles) {
      // We sync the playback state for the downloaded items. allSettled: one
      // item failing to sync must not reject the whole batch (the callers
      // fire-and-forget this promise).
      const syncResults = await Promise.allSettled(
        downloadedFiles.map((downloadedItem) =>
          syncPlaybackState(downloadedItem.item.Id!),
        ),
      );
      // We invalidate the queries again in case we have updated a server's playback progress.
      const shouldInvalidate = syncResults.some(
        (result) => result.status === "fulfilled" && result.value,
      );

      console.log("shouldInvalidate", shouldInvalidate);
      if (shouldInvalidate) {
        queriesToInvalidate.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        );
      }
    }
  };

  return revalidate;
}
