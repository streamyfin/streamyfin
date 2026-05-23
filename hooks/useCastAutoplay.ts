/**
 * Cast autoplay watcher.
 *
 * Always-mounted hook: subscribes to the Chromecast `mediaStatus`, captures the
 * currently-playing episode while playback is active, and on either
 *   (a) playback entering the Outro segment (when `skipOutro !== "auto"`), or
 *   (b) `IDLE + FINISHED` (hard end of media),
 * starts a cancellable countdown via `castAutoplayAtom` and ultimately loads
 * the next episode on the cast.
 *
 * The countdown atom is driven here; the casting-player overlay reads it.
 * Cancellation (overlay's Cancel button) sets the atom to `null` externally;
 * the watcher reacts by clearing its interval and refusing to retrigger for
 * the same item.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import {
  MediaPlayerIdleReason,
  MediaPlayerState,
  useCastDevice,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { castAutoplayAtom } from "@/utils/atoms/castAutoplay";
import { useSettings } from "@/utils/atoms/settings";
import { loadCastMedia } from "@/utils/casting/castLoad";
import { fetchSeriesEpisodes, findNextEpisode } from "@/utils/casting/episodes";
import { useSegments } from "@/utils/segments";

/**
 * Cached next-episode resolution, keyed by the captured (seriesId, currentEpisodeId)
 * pair so the network calls are not repeated on every `mediaStatus` tick.
 */
interface NextEpisodeCache {
  seriesId: string;
  currentEpisodeId: string;
  nextEpisode: BaseItemDto | null;
}

export interface ShouldStartCountdownParams {
  playerState: MediaPlayerState | undefined;
  idleReason: MediaPlayerIdleReason | undefined;
  currentPositionMs: number;
  outroStartMs: number | null;
  outroEndMs: number | null;
  skipOutro: string;
  alreadyTriggered: boolean;
}

/**
 * Pure decision helper: should the countdown start *right now*?
 * Exported for testability.
 */
export const shouldStartCountdown = ({
  playerState,
  idleReason,
  currentPositionMs,
  outroStartMs,
  outroEndMs,
  skipOutro,
  alreadyTriggered,
}: ShouldStartCountdownParams): boolean => {
  if (alreadyTriggered) return false;

  // (b) hard end of media — fires regardless of segment availability.
  if (
    playerState === MediaPlayerState.IDLE &&
    idleReason === MediaPlayerIdleReason.FINISHED
  ) {
    return true;
  }

  // (a) playback inside Outro segment, and Outro is not already auto-skipped.
  if (
    skipOutro !== "auto" &&
    outroStartMs != null &&
    outroEndMs != null &&
    currentPositionMs >= outroStartMs &&
    currentPositionMs < outroEndMs
  ) {
    return true;
  }

  return false;
};

export const useCastAutoplay = (): void => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings, updateSettings } = useSettings();

  const mediaStatus = useMediaStatus();
  const remoteMediaClient = useRemoteMediaClient();
  const castDevice = useCastDevice();

  const [autoplayState, setAutoplayState] = useAtom(castAutoplayAtom);

  // Continuously captured currently-playing item (full BaseItemDto, fetched
  // from Jellyfin). `mediaInfo` clears at IDLE so we must capture as it plays.
  const capturedItemRef = useRef<BaseItemDto | null>(null);
  const capturedItemIdRef = useRef<string | null>(null);

  // Cached next-episode resolution per (seriesId, currentEpisodeId).
  const nextEpisodeCacheRef = useRef<NextEpisodeCache | null>(null);

  // Last item id we triggered a countdown for. Reset when captured item changes
  // so the same finished episode does not retrigger.
  const triggeredForItemIdRef = useRef<string | null>(null);

  // Countdown interval handle.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track whether the atom transitioned to null while a countdown is running —
  // that means the overlay cancelled, so we must not retrigger for this item.
  const autoplayStateRef = useRef(autoplayState);
  autoplayStateRef.current = autoplayState;

  // Latest settings snapshot reachable from the interval / load callback
  // without re-creating the interval on every settings change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettingsRef = useRef(updateSettings);
  updateSettingsRef.current = updateSettings;

  const apiRef = useRef(api);
  apiRef.current = api;
  const userRef = useRef(user);
  userRef.current = user;
  const remoteMediaClientRef = useRef(remoteMediaClient);
  remoteMediaClientRef.current = remoteMediaClient;
  const castDeviceRef = useRef(castDevice);
  castDeviceRef.current = castDevice;

  const contentId = mediaStatus?.mediaInfo?.contentId ?? null;

  // --- 1. Capture the currently-playing item, full BaseItemDto. ---
  useEffect(() => {
    if (!contentId || !api || !user?.Id) return;

    // If the captured id changed, reset the trigger guard immediately — the
    // user moved to another episode, and that new episode should be eligible.
    if (capturedItemIdRef.current !== contentId) {
      triggeredForItemIdRef.current = null;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await getUserLibraryApi(api).getItem(
          { itemId: contentId, userId: user.Id! },
          { signal: controller.signal },
        );
        if (cancelled) return;
        capturedItemRef.current = res.data;
        capturedItemIdRef.current = contentId;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        // Non-fatal: keep whatever we last captured.
        console.error("[useCastAutoplay] Failed to fetch item:", error);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [contentId, api, user?.Id]);

  // --- 2. Resolve next episode (cached per series+episode). ---
  // This effect runs whenever the captured item id changes; the cache key
  // prevents refetching on every mediaStatus tick.
  useEffect(() => {
    const item = capturedItemRef.current;
    if (!item || !api || !user) return;
    if (item.Type !== "Episode") {
      nextEpisodeCacheRef.current = null;
      return;
    }
    const seriesId = item.SeriesId;
    const currentEpisodeId = item.Id;
    if (!seriesId || !currentEpisodeId) {
      nextEpisodeCacheRef.current = null;
      return;
    }

    const cached = nextEpisodeCacheRef.current;
    if (
      cached &&
      cached.seriesId === seriesId &&
      cached.currentEpisodeId === currentEpisodeId
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const episodes = await fetchSeriesEpisodes(api, user, seriesId);
        if (cancelled) return;
        nextEpisodeCacheRef.current = {
          seriesId,
          currentEpisodeId,
          nextEpisode: findNextEpisode(episodes, currentEpisodeId),
        };
      } catch (error) {
        console.error(
          "[useCastAutoplay] Failed to resolve next episode:",
          error,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally depend on contentId (captured item id surrogate) — the
    // captured ref updates synchronously in the effect above using the same
    // dep, so by the time this runs the ref already points to the new item.
  }, [contentId, api, user]);

  // --- 3. Media segments for the captured item (Outro). ---
  // Matches `useChromecastSegments`: cast playback is online, no downloaded
  // files context to thread through.
  const { data: segmentData } = useSegments(
    capturedItemIdRef.current ?? "",
    false,
    undefined,
    api,
  );

  const outroSegment = segmentData?.creditSegments?.[0] ?? null;
  const outroStartMs = outroSegment ? outroSegment.startTime * 1000 : null;
  const outroEndMs = outroSegment ? outroSegment.endTime * 1000 : null;

  // --- 4. Trigger detection. ---
  useEffect(() => {
    // Master gate: setting must allow autoplay, and a countdown must not be
    // already running. The atom drives the countdown; an active atom means
    // we already triggered (possibly via overlay's Play now).
    if (!settings.autoPlayNextEpisode) return;
    if (autoplayState !== null) return;

    const maxValue = settings.maxAutoPlayEpisodeCount.value;
    if (maxValue !== -1 && settings.autoPlayEpisodeCount >= maxValue) return;

    const capturedItem = capturedItemRef.current;
    const capturedItemId = capturedItemIdRef.current;
    if (!capturedItem || !capturedItemId) return;
    if (capturedItem.Type !== "Episode") return;

    const cached = nextEpisodeCacheRef.current;
    if (
      !cached ||
      cached.currentEpisodeId !== capturedItemId ||
      !cached.nextEpisode
    ) {
      return;
    }
    const nextEpisode = cached.nextEpisode;

    const currentPositionMs = (mediaStatus?.streamPosition ?? 0) * 1000;

    const should = shouldStartCountdown({
      playerState: mediaStatus?.playerState as MediaPlayerState | undefined,
      idleReason: mediaStatus?.idleReason as MediaPlayerIdleReason | undefined,
      currentPositionMs,
      outroStartMs,
      outroEndMs,
      skipOutro: settings.skipOutro,
      alreadyTriggered: triggeredForItemIdRef.current === capturedItemId,
    });

    if (!should) return;

    triggeredForItemIdRef.current = capturedItemId;
    setAutoplayState({
      nextEpisode,
      secondsRemaining: settings.castAutoplayCountdownSeconds,
    });
    // The countdown interval is started by the effect below (reacts to the
    // atom transitioning to non-null), so this effect stays pure-decide.
  }, [
    mediaStatus?.playerState,
    mediaStatus?.idleReason,
    mediaStatus?.streamPosition,
    outroStartMs,
    outroEndMs,
    settings.autoPlayNextEpisode,
    settings.autoPlayEpisodeCount,
    settings.maxAutoPlayEpisodeCount,
    settings.castAutoplayCountdownSeconds,
    settings.skipOutro,
    autoplayState,
    setAutoplayState,
  ]);

  // --- 5. Run countdown interval whenever atom is non-null. ---
  // Starting/stopping is driven by the atom value, so an external Cancel
  // (overlay) that sets the atom to null naturally tears the interval down.
  useEffect(() => {
    if (autoplayState === null) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Only start an interval if one is not already running.
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      // Read latest atom value from ref to decide what to do next.
      const current = autoplayStateRef.current;
      if (current === null) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const next = current.secondsRemaining - 1;
      if (next > 0) {
        setAutoplayState({ ...current, secondsRemaining: next });
        return;
      }

      // Time's up — load the next episode and clear.
      // Snapshot what we need; clear the interval and atom synchronously to
      // avoid double-fire.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const episodeToLoad = current.nextEpisode;
      setAutoplayState(null);

      const apiLocal = apiRef.current;
      const userLocal = userRef.current;
      const clientLocal = remoteMediaClientRef.current;
      const deviceLocal = castDeviceRef.current;
      const settingsLocal = settingsRef.current;

      if (!apiLocal || !userLocal?.Id || !clientLocal || !episodeToLoad?.Id) {
        return;
      }

      // Mirror `useCastEpisodes.loadEpisode` exactly — same arguments,
      // same start-position derivation.
      (async () => {
        try {
          const startPositionMs =
            (episodeToLoad.UserData?.PlaybackPositionTicks ?? 0) / 10000;

          const result = await loadCastMedia({
            client: clientLocal,
            device: deviceLocal,
            api: apiLocal,
            item: episodeToLoad,
            userId: userLocal.Id!,
            profileMode: settingsLocal.chromecastProfile,
            maxBitrateSetting: settingsLocal.chromecastMaxBitrate,
            options: { startPositionMs },
          });

          if (!result.ok) {
            console.error(
              "[useCastAutoplay] Failed to load next episode:",
              result.error,
            );
            return;
          }

          updateSettingsRef.current({
            autoPlayEpisodeCount: settingsLocal.autoPlayEpisodeCount + 1,
          });
          toast("Playing next episode");
        } catch (error) {
          console.error(
            "[useCastAutoplay] Failed to load next episode:",
            error,
          );
        }
      })();
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoplayState, setAutoplayState]);

  // --- 6. Final unmount cleanup is covered by the interval effect's
  // return; nothing else to do here.
};

export default useCastAutoplay;
