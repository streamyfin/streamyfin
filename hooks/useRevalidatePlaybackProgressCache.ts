import { PLAYBACK_PROGRESS_QUERY_KEYS } from "@/constants/Playback";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useDownload } from "@/providers/DownloadProvider";
import { useTwoWaySync } from "./useTwoWaySync";

/**
 * useRevalidatePlaybackProgressCache invalidates queries related to playback progress.
 */
export function useInvalidatePlaybackProgressCache() {
  const queryClient = useNetworkAwareQueryClient();
  const { getDownloadedItems, triggerRefresh } = useDownload();
  const { syncPlaybackStateDetailed } = useTwoWaySync();

  const revalidate = async () => {
    const queriesToInvalidate = PLAYBACK_PROGRESS_QUERY_KEYS.map((key) => [
      ...key,
    ]);

    // We Invalidate all the queries to the latest server versions
    await Promise.all(
      queriesToInvalidate.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

    const downloadedFiles = getDownloadedItems();
    // Sync playback state for downloaded items
    if (downloadedFiles) {
      // Takes the server's newer state into the downloads, and sends none: the
      // local progress belongs to whoever watched offline, and only the offline
      // sync knows who that was (useOfflineProgressSync pushes it per user).
      // allSettled: one item failing must not reject the whole batch (the
      // callers fire-and-forget this promise).
      const syncResults = await Promise.allSettled(
        downloadedFiles.map((downloadedItem) =>
          syncPlaybackStateDetailed(downloadedItem.item.Id!, { push: false }),
        ),
      );
      // syncPlaybackStateDetailed handles its own errors and resolves to a
      // result; a rejection here is an unexpected bug worth surfacing.
      for (const result of syncResults) {
        if (result.status === "rejected") {
          console.error(
            "Unexpected syncPlaybackState rejection:",
            result.reason,
          );
        }
      }
      // A pull rewrote downloaded records the pages above were already
      // refetched from, and the downloads views read the records directly.
      const pulled = syncResults.some(
        (result) => result.status === "fulfilled" && result.value === "pulled",
      );
      if (pulled) {
        triggerRefresh();
        await Promise.all(
          queriesToInvalidate.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
      }
    }
  };

  return revalidate;
}
