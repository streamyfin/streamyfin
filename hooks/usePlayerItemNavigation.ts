/**
 * Single source of truth for *all* item-level navigation inside the
 * player (next / previous / picked-from-episode-list / autoplay-next).
 *
 * This hook encapsulates three orthogonal concerns so callers don't
 * have to:
 *
 *  1. **SyncPlay** — when a group is active, every advance/rewind
 *     dispatches through `Controller`. `SyncPlayProvider` handles the
 *     resulting `localPlay` / `localSetCurrentPlaylistItem` events and
 *     navigates the local screen.
 *  2. **Autoplay gating** — `maxAutoPlayEpisodeCount` limits how many
 *     episodes auto-play before stopping. Manual presses bypass this.
 *     SyncPlay bypasses it too (the server drives the queue).
 *  3. **Platform navigation** — mobile uses `router.setParams` so the
 *     player view stays mounted (avoids a full re-mount + bitrate /
 *     stream re-pick cycle). TV uses `router.replace` because MPV's
 *     native view can't be re-initialized in place. Offline state is
 *     preserved automatically by `useAppRouter`.
 */

import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform } from "react-native";
import useAppRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { getDownloadedItemById } from "@/providers/Downloads";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSyncPlay } from "@/providers/SyncPlay";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";

interface UsePlayerItemNavigationParams {
  /**
   * The adjacent item that "next" should target (from `usePlaybackManager`).
   * Only needed by callers that use the in-session nav methods.
   */
  nextItem?: BaseItemDto | null;
  /** The adjacent item that "previous" should target. */
  previousItem?: BaseItemDto | null;
  /** The active media source for the *current* item; used to seed track defaults. */
  mediaSource?: MediaSourceInfo | null;
  /** Live audio track index (may differ from the URL param after the user changed tracks). */
  currentAudioIndex?: number;
  /** Live subtitle track index. */
  currentSubtitleIndex?: number;
  /** Currently-active bitrate cap. */
  bitrateValue?: number;
  /**
   * Optional guard for "we're already stopping the player". TV passes
   * `isPlaybackStopped` here to drop spurious next-item dispatches that
   * fire during teardown.
   */
  isDisabled?: boolean;
}

/** Options for `playItem` — the entry-point method used by PlayButton et al. */
export interface PlayItemOptions {
  audioIndex?: number;
  subtitleIndex?: number;
  mediaSourceId?: string;
  bitrateValue?: number;
  /** Defaults to `item.UserData?.PlaybackPositionTicks`. */
  playbackPosition?: number;
  /**
   * Force local-file playback even outside the offline UI context, and
   * skip SyncPlay broadcasting. Used when the user explicitly picks the
   * downloaded copy from a "play downloaded?" prompt.
   */
  forceOffline?: boolean;
}

export interface PlayerItemNavigation {
  /** SyncPlay-aware previous. No-op when there's no previous item. */
  goToPreviousItem: () => void;
  /**
   * Manual next (e.g. user tapped the skip-forward / next button).
   * Autoplay gating is bypassed.
   */
  goToNextItem: () => void;
  /** Jump to an arbitrary item (episode picker). */
  goToItem: (item: BaseItemDto) => void;
  /**
   * Autoplay next (e.g. "Up Next" overlay countdown completed). Respects
   * `maxAutoPlayEpisodeCount`. Bypassed when SyncPlay is active.
   */
  handleAutoPlayNext: () => void;
  /**
   * Helper for the "Keep Watching" overlay button — advances and resets
   * the auto-play counter so the next stretch of episodes can autoplay.
   */
  handleContinueWatching: () => void;
  /**
   * Entry-point: start playback of an item from outside the player
   * (PlayButton, Continue Watching, episode picker on the item page).
   * SyncPlay-aware. Resets the autoplay counter.
   */
  playItem: (item: BaseItemDto, opts?: PlayItemOptions) => Promise<void>;
}

export function usePlayerItemNavigation(
  params: UsePlayerItemNavigationParams = {},
): PlayerItemNavigation {
  const {
    nextItem,
    previousItem,
    mediaSource,
    currentAudioIndex,
    currentSubtitleIndex,
    bitrateValue,
    isDisabled,
  } = params;

  const router = useAppRouter();
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { isEnabled: isSyncPlayEnabled, controller: syncPlayController } =
    useSyncPlay();
  const lightHapticFeedback = useHaptic("light");
  // Note: "offline mode" is a *UI context* flag (set by pages entered from
  // the downloads tab), not a network-connectivity status. A user may be
  // in offline mode with perfect internet, watching a downloaded copy.
  const inOfflineContext = useOfflineMode();

  /*
   * Compute the destination URL params for a given target item, using
   * the live selection state (which may differ from the URL params the
   * episode started with — the user may have switched tracks mid-play).
   */
  const buildNavigationParams = useCallback(
    (target: BaseItemDto) => {
      if (!settings) return null;
      const {
        mediaSource: newMediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(
        target,
        settings,
        {
          indexes: {
            subtitleIndex: currentSubtitleIndex,
            audioIndex: currentAudioIndex,
          },
          source: mediaSource ?? undefined,
        },
        { applyLanguagePreferences: true },
      );
      return {
        itemId: target.Id ?? "",
        audioIndex: defaultAudioIndex?.toString() ?? "",
        subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
        mediaSourceId: newMediaSource?.Id ?? "",
        bitrateValue: bitrateValue?.toString() ?? "",
        playbackPosition:
          target.UserData?.PlaybackPositionTicks?.toString() ?? "",
      };
    },
    [
      settings,
      currentSubtitleIndex,
      currentAudioIndex,
      mediaSource,
      bitrateValue,
    ],
  );

  /*
   * Stamp the `offline` URL param onto a params object based on whether
   * the target item is actually downloaded.
   *
   * - Online (no offline UI context) → pass through unchanged; the
   *   `offline` key is absent so `useAppRouter` doesn't touch it.
   * - Offline context, target IS downloaded → `offline: "true"` (play
   *   the local copy).
   * - Offline context, target is NOT downloaded → `offline: ""` (force
   *   online streaming; the key's presence blocks `useAppRouter` from
   *   auto-injecting `"true"`, and direct-player only treats the value
   *   `"true"` as offline).
   *
   * That last case is the important one: a user can be in the offline
   * UI context with perfect internet (e.g. navigated in from downloads)
   * and pick an episode they never downloaded. Without this the player
   * would hang waiting for a local file that doesn't exist.
   */
  const withOfflineParam = useCallback(
    (params: Record<string, string>, target: BaseItemDto) => {
      if (!inOfflineContext) return params;
      const isDownloaded = !!(target.Id && getDownloadedItemById(target.Id));
      return { ...params, offline: isDownloaded ? "true" : "" };
    },
    [inOfflineContext],
  );

  /*
   * Platform-appropriate local navigation. Mobile keeps the same player
   * view mounted via setParams; TV swaps the whole route via replace.
   */
  const localNavigate = useCallback(
    (target: BaseItemDto) => {
      if (isDisabled) return;
      const navParams = buildNavigationParams(target);
      if (!navParams) return;
      lightHapticFeedback();

      const finalParams = withOfflineParam(navParams, target);

      if (Platform.isTV) {
        const queryString = new URLSearchParams(finalParams).toString();
        router.replace(`/player/direct-player?${queryString}`);
      } else {
        router.setParams(finalParams);
      }
    },
    [
      isDisabled,
      buildNavigationParams,
      router,
      lightHapticFeedback,
      withOfflineParam,
    ],
  );

  const goToPreviousItem = useCallback(() => {
    if (isSyncPlayEnabled && syncPlayController) {
      syncPlayController.previousItem();
      return;
    }
    if (!previousItem) return;
    localNavigate(previousItem);
  }, [isSyncPlayEnabled, syncPlayController, previousItem, localNavigate]);

  const goToNextItem = useCallback(() => {
    if (isSyncPlayEnabled && syncPlayController) {
      syncPlayController.nextItem();
      return;
    }
    if (!nextItem) return;
    localNavigate(nextItem);
  }, [isSyncPlayEnabled, syncPlayController, nextItem, localNavigate]);

  const goToItem = useCallback(
    (target: BaseItemDto) => {
      if (isSyncPlayEnabled && syncPlayController && target.Id) {
        syncPlayController.goToItem(target);
        return;
      }
      localNavigate(target);
    },
    [isSyncPlayEnabled, syncPlayController, localNavigate],
  );

  const handleAutoPlayNext = useCallback(() => {
    // SyncPlay always advances unconditionally — the server is the source
    // of truth for queue progression and per-client gating would desync us.
    if (isSyncPlayEnabled && syncPlayController) {
      syncPlayController.nextItem();
      return;
    }
    if (!nextItem) return;

    const maxCount = settings?.maxAutoPlayEpisodeCount.value ?? 0;
    const currentCount = settings?.autoPlayEpisodeCount ?? 0;

    // -1 means "no limit"
    if (maxCount === -1) {
      localNavigate(nextItem);
      return;
    }

    if (currentCount + 1 < maxCount) {
      localNavigate(nextItem);
    }

    if (currentCount < maxCount) {
      updateSettings({ autoPlayEpisodeCount: currentCount + 1 });
    }
  }, [
    isSyncPlayEnabled,
    syncPlayController,
    nextItem,
    settings,
    updateSettings,
    localNavigate,
  ]);

  const handleContinueWatching = useCallback(() => {
    if (isSyncPlayEnabled && syncPlayController) {
      syncPlayController.nextItem();
      return;
    }
    if (!nextItem) return;
    updateSettings({ autoPlayEpisodeCount: 0 });
    localNavigate(nextItem);
  }, [
    isSyncPlayEnabled,
    syncPlayController,
    nextItem,
    updateSettings,
    localNavigate,
  ]);

  /*
   * Entry-point: start playback of an item from outside the player.
   *
   * Used by PlayButton, Continue Watching cards, episode pickers on the
   * item page, etc. Unlike the in-session methods, this always uses
   * `router.push` (we're entering the player, not navigating within it)
   * and runs on both mobile and TV with the same shape.
   *
   * SyncPlay: when in a group and the user *didn't* explicitly request
   * local playback, we route through `controller.play()` so every group
   * member gets the same `PlayQueue: NewPlaylist` update and navigates
   * together. Errors surface as an Alert and abort the local navigation
   * (matches `PlayButton`'s previous behavior).
   */
  const playItem = useCallback(
    async (item: BaseItemDto, opts: PlayItemOptions = {}) => {
      if (!item.Id) return;
      lightHapticFeedback();

      const startPositionTicks =
        opts.playbackPosition ?? item.UserData?.PlaybackPositionTicks ?? 0;

      // Fresh playback start — reset the autoplay budget so the next
      // stretch of episodes can autoplay.
      if (settings && settings.maxAutoPlayEpisodeCount.value !== -1) {
        updateSettings({ autoPlayEpisodeCount: 0 });
      }

      // SyncPlay: broadcast to the group instead of navigating locally.
      // Skipped when the user explicitly picked the downloaded copy — a
      // local file can't be part of a synced session.
      if (!opts.forceOffline && isSyncPlayEnabled && syncPlayController) {
        try {
          await syncPlayController.play({
            items: [item],
            ids: [item.Id],
            startPositionTicks,
          });
        } catch (error) {
          console.error("SyncPlay: failed to start group playback", error);
          Alert.alert(
            t("player.client_error"),
            t("syncplay.failed_to_start", {
              defaultValue: "Failed to start SyncPlay group playback",
            }),
          );
        }
        return;
      }

      // Build a string-record so we can run it through `withOfflineParam`
      // and `URLSearchParams` uniformly.
      const baseParams: Record<string, string> = {
        itemId: item.Id,
        playbackPosition: String(startPositionTicks),
      };
      if (opts.audioIndex !== undefined) {
        baseParams.audioIndex = String(opts.audioIndex);
      }
      if (opts.subtitleIndex !== undefined) {
        baseParams.subtitleIndex = String(opts.subtitleIndex);
      }
      if (opts.mediaSourceId) {
        baseParams.mediaSourceId = opts.mediaSourceId;
      }
      if (opts.bitrateValue !== undefined) {
        baseParams.bitrateValue = String(opts.bitrateValue);
      }

      const finalParams = opts.forceOffline
        ? { ...baseParams, offline: "true" }
        : withOfflineParam(baseParams, item);

      const queryString = new URLSearchParams(finalParams).toString();
      router.push(`/player/direct-player?${queryString}`);
    },
    [
      lightHapticFeedback,
      settings,
      updateSettings,
      isSyncPlayEnabled,
      syncPlayController,
      withOfflineParam,
      router,
      t,
    ],
  );

  return {
    goToPreviousItem,
    goToNextItem,
    goToItem,
    handleAutoPlayNext,
    handleContinueWatching,
    playItem,
  };
}

export default usePlayerItemNavigation;
