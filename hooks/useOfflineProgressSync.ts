import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { PLAYBACK_PROGRESS_QUERY_KEYS } from "@/constants/Playback";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useDownload } from "@/providers/DownloadProvider";
import {
  checkApiReachable,
  useNetworkStatus,
} from "@/providers/NetworkStatusProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { writeToLog } from "@/utils/log";
import {
  clearOfflineProgress,
  getOfflineProgress,
} from "@/utils/offlineProgressQueue";
import { onAppForeground } from "@/utils/onAppForeground";
import { useTwoWaySync } from "./useTwoWaySync";

/**
 * Pushes the watch progress of downloads watched while the server could not
 * be reached, as soon as it answers again, and takes the server's state for
 * items watched more recently elsewhere (useTwoWaySync decides which side
 * wins).
 *
 * Works from the queue usePlaybackManager fills (utils/offlineProgressQueue):
 * only the signed-in user's own offline progress is sent, so switching
 * accounts never writes one user's progress into another's, and a launch with
 * nothing queued sends nothing.
 *
 * Before this, the reconciliation only ran when a player closed (often still
 * offline, so it did nothing) or on a pull to refresh: progress made on a
 * plane stayed on the phone until the user happened to refresh Home.
 */
export function useOfflineProgressSync() {
  const { serverConnected } = useNetworkStatus();
  const api = useAtomValue(apiAtom);
  const userId = useAtomValue(userAtom)?.Id;
  const { getDownloadedItemById } = useDownload();
  const { syncPlaybackStateDetailed } = useTwoWaySync();
  const queryClient = useNetworkAwareQueryClient();

  // The sync reads the api, the user and the connection when it runs, so
  // keep the latest closures instead of re-subscribing on every render.
  const latest = useRef({
    api,
    userId,
    serverConnected,
    getDownloadedItemById,
    syncPlaybackStateDetailed,
    queryClient,
  });
  latest.current = {
    api,
    userId,
    serverConnected,
    getDownloadedItemById,
    syncPlaybackStateDetailed,
    queryClient,
  };

  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const syncRef = useRef<() => void>(() => {});

  syncRef.current = () => {
    // A trigger while a run is in flight (a quick Wi-Fi to cellular hop) is
    // not dropped: the run goes again once it is done.
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }
    const current = latest.current;
    // null is "not probed yet"; false is unreachable.
    if (current.serverConnected !== true || !current.userId) return;
    const user = current.userId;
    const queued = getOfflineProgress(user);
    if (queued.length === 0) return;
    writeToLog("DEBUG", `Offline progress sync: ${queued.length} queued`);

    runningRef.current = true;
    const run = async () => {
      // An item deleted since is dropped from the queue with nothing to push.
      const gone = queued.filter((id) => !current.getDownloadedItemById(id));
      const items = queued.filter((id) => !gone.includes(id));
      if (gone.length > 0) clearOfflineProgress(user, gone);
      if (items.length === 0) return;

      // serverConnected starts out true before anything was probed.
      if (!(await checkApiReachable(current.api?.basePath))) {
        writeToLog("DEBUG", "Offline progress sync: server not answering yet");
        return;
      }
      // Signed out or switched while the probe was out: not this user's turn.
      if (latest.current.userId !== user) return;

      const results = await Promise.allSettled(
        items.map((id) => current.syncPlaybackStateDetailed(id)),
      );
      const outcome = (i: number) => {
        const result = results[i];
        return result.status === "fulfilled" ? result.value : "failed";
      };
      // Reconciled, whichever side won, leaves the queue; a failed one stays
      // for the next attempt.
      clearOfflineProgress(
        user,
        items.filter((_, i) => outcome(i) !== "failed"),
      );

      const pushed = items.filter((_, i) => outcome(i) === "pushed").length;
      writeToLog(
        "DEBUG",
        `Offline progress sync: ${items.map((_, i) => outcome(i)).join(", ")}`,
      );
      if (pushed === 0) return;
      writeToLog("INFO", `Synced offline progress of ${pushed} item(s)`);
      await Promise.all(
        PLAYBACK_PROGRESS_QUERY_KEYS.map((queryKey) =>
          current.queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    };

    run()
      .catch((error) => {
        writeToLog("ERROR", "Offline progress sync failed", error);
      })
      .finally(() => {
        runningRef.current = false;
        if (rerunRef.current) {
          rerunRef.current = false;
          syncRef.current();
        }
      });
  };

  // The server answering again, and a sign-in (the queue is per user).
  useEffect(() => {
    syncRef.current();
  }, [serverConnected, userId]);

  // A reconnect that happened while the queue was still empty, or one the
  // network events never told us about.
  useEffect(() => onAppForeground(() => syncRef.current()), []);
}
