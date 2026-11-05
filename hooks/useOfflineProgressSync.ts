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
  type OfflineProgress,
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
  // A trigger that arrived mid-run, and whether it asked to probe.
  const rerunRef = useRef<{ probe: boolean } | null>(null);
  const syncRef = useRef<(probe?: boolean) => void>(() => {});

  /**
   * [probe] checks the server even when the last known status says it is
   * unreachable: nothing re-probes it on its own when the app returns to the
   * foreground.
   */
  syncRef.current = (probe = false) => {
    // A trigger while a run is in flight (a quick Wi-Fi to cellular hop) is
    // not dropped: the run goes again once it is done.
    if (runningRef.current) {
      rerunRef.current = { probe: probe || rerunRef.current?.probe === true };
      return;
    }
    const current = latest.current;
    // null is "not probed yet"; false is unreachable.
    if ((current.serverConnected !== true && !probe) || !current.userId) {
      return;
    }
    const user = current.userId;
    const queued = getOfflineProgress(user);
    const ids = Object.keys(queued);
    if (ids.length === 0) return;
    writeToLog("DEBUG", `Offline progress sync: ${ids.length} queued`);

    const only = (keep: string[]): OfflineProgress =>
      Object.fromEntries(keep.map((id) => [id, queued[id]]));

    runningRef.current = true;
    const run = async () => {
      // Dropped with nothing to push: a download deleted since, and local
      // progress saved again since this user's, by another account on the
      // device (downloads carry no owner) or by this one while online. That
      // progress is not this user's to send.
      const stale = ids.filter((id) => {
        const local = current.getDownloadedItemById(id);
        if (!local) return true;
        const saved = queued[id];
        return saved !== "" && local.item.UserData?.LastPlayedDate !== saved;
      });
      const items = ids.filter((id) => !stale.includes(id));
      if (stale.length > 0) clearOfflineProgress(user, only(stale));
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
      // Reconciled, whichever side won, or gone from the server, leaves the
      // queue; a failed one stays for the next attempt. Progress saved again
      // during the sync stays too (clearOfflineProgress compares).
      clearOfflineProgress(
        user,
        only(items.filter((_, i) => outcome(i) !== "failed")),
      );

      const count = (result: string) =>
        items.filter((_, i) => outcome(i) === result).length;
      const pushed = count("pushed");
      writeToLog(
        "DEBUG",
        `Offline progress sync: ${items.map((_, i) => outcome(i)).join(", ")}`,
      );
      if (pushed > 0) {
        writeToLog("INFO", `Synced offline progress of ${pushed} item(s)`);
      }
      // A pull rewrote the downloaded record: cached pages show the old one.
      if (pushed + count("pulled") === 0) return;
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
        const rerun = rerunRef.current;
        if (rerun) {
          rerunRef.current = null;
          syncRef.current(rerun.probe);
        }
      });
  };

  // The server answering again, a sign-in (the queue is per user), and the
  // server being set again (the user stays signed in meanwhile).
  const basePath = api?.basePath;
  useEffect(() => {
    syncRef.current();
  }, [serverConnected, userId, basePath]);

  // A reconnect that happened while the queue was still empty, or one the
  // network events never told us about: probe, whatever the last status.
  useEffect(() => onAppForeground(() => syncRef.current(true)), []);
}
