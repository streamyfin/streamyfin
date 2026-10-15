import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import NetInfo from "@react-native-community/netinfo";
import { useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import type { Bitrate } from "@/components/BitrateSelector";
import { NEXT_EPISODES_MIN_FREE_BYTES } from "@/constants/Downloads";
import { userAtom } from "@/providers/JellyfinProvider";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import { getOrSetDeviceId } from "@/utils/device";
import { logAndCaptureError } from "@/utils/log";
import { onAppForeground } from "@/utils/onAppForeground";
import { getAllDownloadedItems, removeDownloadedItem } from "../database";
import { resolveDefaultDownload } from "../defaultDownload";
import { isUnmeteredConnection } from "../downloadRequest";
import { deleteAllAssociatedFiles } from "../fileOperations";
import { homeNetworkConfig, isOnHomeNetwork } from "../homeNetwork";
import { planNextEpisodes, withLocalPlayState } from "../nextEpisodes";
import { networkHold, nextEpisodesHoldAtom } from "../nextEpisodesHold";
import {
  type NextEpisodesRule,
  nextEpisodesRulesAtom,
  rulesOfUser,
  withDownloadedIds,
} from "../nextEpisodesRules";
import { getPendingDownloads } from "../pendingDownloads";
import type { JobStatus } from "../types";

type StartDownload = (
  url: string,
  item: BaseItemDto,
  mediaSource: NonNullable<BaseItemDto["MediaSources"]>[number],
  maxBitrate: Bitrate,
  audioStreamIndex?: number,
  subtitleStreamIndex?: number,
) => Promise<void>;

interface UseNextEpisodesDownloadsProps {
  api: Api | null;
  processes: JobStatus[];
  startBackgroundDownload: StartDownload;
  onDataChange: () => void;
}

/**
 * The items playing on this device, which a rule must not delete. Null when
 * the server cannot say, and then nothing is deleted.
 */
const playingOnThisDevice = async (api: Api): Promise<Set<string> | null> => {
  try {
    const { data } = await getSessionApi(api).getSessions({
      deviceId: getOrSetDeviceId(),
    });
    return new Set(
      data
        .map((session) => session.NowPlayingItem?.Id)
        .filter((id): id is string => !!id),
    );
  } catch (error) {
    console.warn("[NextEpisodes] Could not read the playing item:", error);
    return null;
  }
};

const freeDiskBytes = async (): Promise<number> => {
  try {
    return await DeviceInfo.getFreeDiskStorage();
  } catch {
    // Unknown counts as full: a download that fills the disk is worse than
    // one that waits for the next check.
    return 0;
  }
};

/**
 * Keeps the next episodes of every series with a rule downloaded, and deletes
 * the watched ones where the rule says so.
 *
 * Each check works out the whole state again from the server's episodes and
 * what is on the device, so running it twice changes nothing and a missed
 * trigger is made up by the next. It runs when the app starts or comes back
 * to the foreground, when Wi-Fi returns while it was waiting for it, when the
 * app switches between the server's local and remote address, and from
 * the playback progress refresh that follows the player closing or an episode
 * being marked as watched.
 */
export function useNextEpisodesDownloads({
  api,
  processes,
  startBackgroundDownload,
  onDataChange,
}: UseNextEpisodesDownloadsProps) {
  const store = useStore();
  // A check runs for a while and reads these when it gets to them, so a start
  // late in a check sees the processes the earlier starts added. Written once
  // a render commits, so a render React discards cannot hand a check processes
  // that never were, and in a layout effect, so the values are there before
  // any effect can start a check.
  const latest = useRef({
    api,
    processes,
    startBackgroundDownload,
    onDataChange,
  });
  useLayoutEffect(() => {
    latest.current = { api, processes, startBackgroundDownload, onDataChange };
  });
  const running = useRef<Promise<void> | null>(null);
  const runAgain = useRef(false);

  const checkSeries = useCallback(
    async (
      api: Api,
      userId: string,
      rule: NextEpisodesRule,
      playingIds: Set<string> | null,
      deleteAnyDownload: boolean,
    ) => {
      const { data } = await getTvShowsApi(api).getEpisodes({
        seriesId: rule.seriesId,
        userId,
        isMissing: false,
        enableUserData: true,
      });
      const downloaded = getAllDownloadedItems().filter(
        (download) => download.item.SeriesId === rule.seriesId,
      );
      const busyIds = new Set([
        ...latest.current.processes.map((process) => process.id),
        ...getPendingDownloads().map((pending) => pending.itemId),
      ]);
      const plan = planNextEpisodes({
        episodes: withLocalPlayState(data.Items ?? [], downloaded),
        rule: playingIds ? rule : { ...rule, deleteWatched: false },
        downloadedIds: new Set(downloaded.map((download) => download.item.Id!)),
        busyIds,
        playingIds: playingIds ?? new Set(),
        deleteAnyDownload,
      });

      const removed: string[] = [];
      for (const id of plan.remove) {
        const download = removeDownloadedItem(id);
        if (!download) continue;
        try {
          deleteAllAssociatedFiles(download);
        } catch (error) {
          console.error("[NextEpisodes] Could not delete the files:", error);
        }
        removed.push(id);
      }
      if (removed.length > 0) {
        store.set(nextEpisodesRulesAtom, (rules) =>
          withDownloadedIds(rules, userId, rule.seriesId, { removed }),
        );
      }
      return { download: plan.download, removed: removed.length > 0 };
    },
    [store],
  );

  const checkOnce = useCallback(async () => {
    const { api } = latest.current;
    const user = store.get(userAtom);
    const settings = store.get(effectiveSettingsAtom);
    const userId = user?.Id;
    const rules = rulesOfUser(store.get(nextEpisodesRulesAtom), userId);
    if (
      !api ||
      !userId ||
      rules.length === 0 ||
      !user.Policy?.EnableContentDownloading
    ) {
      store.set(nextEpisodesHoldAtom, null);
      return;
    }
    const network = await NetInfo.fetch();
    // Offline there is no server to ask, and what held the downloads back
    // still does.
    if (!network.isConnected) return;

    const playingIds = await playingOnThisDevice(api);
    const toDownload: {
      seriesId: string;
      episode: BaseItemDto;
      bitrate?: Bitrate;
    }[] = [];
    let removedAny = false;
    for (const rule of rules) {
      try {
        const { download, removed } = await checkSeries(
          api,
          userId,
          rule,
          playingIds,
          settings.nextEpisodesDeleteAnyDownload,
        );
        removedAny ||= removed;
        for (const episode of download) {
          toDownload.push({
            seriesId: rule.seriesId,
            episode,
            bitrate: rule.bitrate,
          });
        }
      } catch (error) {
        // One series the server cannot list must not stop the others.
        logAndCaptureError("Checking the next episodes failed", error);
      }
    }
    if (removedAny) latest.current.onDataChange();

    if (toDownload.length === 0) {
      store.set(nextEpisodesHoldAtom, null);
      return;
    }
    const heldByNetwork = networkHold(settings.nextEpisodesNetwork, network, {
      setUp: homeNetworkConfig() !== null,
      on: isOnHomeNetwork(api),
    });
    if (heldByNetwork) {
      store.set(nextEpisodesHoldAtom, heldByNetwork);
      return;
    }

    for (const { seriesId, episode, bitrate } of toDownload) {
      // Checked before every episode: each one takes room the next needs.
      if ((await freeDiskBytes()) < NEXT_EPISODES_MIN_FREE_BYTES) {
        store.set(nextEpisodesHoldAtom, "low_space");
        return;
      }
      try {
        const download = await resolveDefaultDownload({
          api,
          userId,
          itemId: episode.Id!,
          settings,
          bitrate,
        });
        if (!download) {
          console.warn(`[NextEpisodes] No stream for ${episode.Name}`);
          continue;
        }
        await latest.current.startBackgroundDownload(
          download.url,
          download.item,
          download.mediaSource,
          download.bitrate,
          download.audioIndex,
          download.subtitleIndex,
        );
        store.set(nextEpisodesRulesAtom, (rules) =>
          withDownloadedIds(rules, userId, seriesId, {
            added: [episode.Id!],
          }),
        );
      } catch (error) {
        logAndCaptureError("Downloading a next episode failed", error);
      }
    }
    store.set(nextEpisodesHoldAtom, null);
  }, [store, checkSeries]);

  /**
   * Starts a check, or queues one more after the check that is running. The
   * promise settles once no check is left to run.
   */
  const runNextEpisodesCheck = useCallback((): Promise<void> => {
    if (Platform.isTV) return Promise.resolve();
    if (running.current) {
      runAgain.current = true;
      return running.current;
    }
    running.current = (async () => {
      try {
        do {
          runAgain.current = false;
          await checkOnce();
        } while (runAgain.current);
      } catch (error) {
        logAndCaptureError(
          "Keeping the next episodes downloaded failed",
          error,
        );
      } finally {
        running.current = null;
      }
    })();
    return running.current;
  }, [checkOnce]);

  // At start, and at sign-in or an account switch: another user has other rules.
  const userId = useAtomValue(userAtom)?.Id;
  useEffect(() => {
    if (api && userId) runNextEpisodesCheck();
  }, [api, userId, runNextEpisodesCheck]);

  useEffect(
    () => onAppForeground(runNextEpisodesCheck),
    [runNextEpisodesCheck],
  );

  // Downloads waiting for Wi-Fi start as soon as it is back. Those waiting for
  // the home network start when the app switches to the server's local
  // address: that is a new api, and the check above runs again for it.
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        if (
          store.get(nextEpisodesHoldAtom) === "waiting_for_wifi" &&
          isUnmeteredConnection(state)
        ) {
          runNextEpisodesCheck();
        }
      }),
    [store, runNextEpisodesCheck],
  );

  return { runNextEpisodesCheck };
}
