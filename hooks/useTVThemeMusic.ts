import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import {
  type AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from "expo-audio";
import { useSegments } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";
import {
  TV_THEME_CACHE_MS,
  TV_THEME_FADE_IN_MS,
  TV_THEME_FADE_OUT_MS,
  TV_THEME_FADE_STEP_MS,
  TV_THEME_MAX_BITRATE,
  TV_THEME_VOLUME,
} from "@/constants/TVThemeMusic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { useSettings } from "@/utils/atoms/settings";
import { isPlaybackActive } from "@/utils/playbackRoute";

/**
 * Smoothly transitions audio volume from `from` to `to` over `duration` ms.
 * Returns a cleanup function that cancels the fade.
 */
function fadeVolume(
  player: AudioPlayer,
  from: number,
  to: number,
  duration: number,
): { promise: Promise<void>; cancel: () => void } {
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };

  const steps = Math.max(1, Math.floor(duration / TV_THEME_FADE_STEP_MS));
  const delta = (to - from) / steps;

  const promise = new Promise<void>((resolve) => {
    let current = from;
    let step = 0;

    const tick = () => {
      if (cancelled || step >= steps) {
        if (!cancelled) {
          player.volume = to;
        }
        resolve();
        return;
      }
      step++;
      current += delta;
      player.volume = Math.max(0, Math.min(1, current));
      if (!cancelled) {
        setTimeout(tick, TV_THEME_FADE_STEP_MS);
      } else {
        resolve();
      }
    };

    tick();
  });

  return { promise, cancel };
}

// --- Module-level singleton state ---
let sharedPlayer: AudioPlayer | null = null;
let currentSongId: string | null = null;
let ownerCount = 0;
let activeFade: { cancel: () => void } | null = null;
let cleanupPromise: Promise<void> | null = null;
let preserveAudioSession = false;
let playbackHasAudio = false;

/**
 * Stop and release the shared player. Fades out unless `immediate`, which is
 * for playback taking over: a one second tail would overlap the video audio.
 */
async function teardownSharedPlayer(immediate: boolean): Promise<void> {
  const player = sharedPlayer;
  if (!player) return;

  activeFade?.cancel();
  activeFade = null;

  try {
    if (player.isLoaded && !immediate) {
      const currentVolume = player.volume ?? TV_THEME_VOLUME;
      const fade = fadeVolume(player, currentVolume, 0, TV_THEME_FADE_OUT_MS);
      activeFade = fade;
      await fade.promise;
      if (activeFade === fade) activeFade = null;
    }
    player.pause();
    player.remove();
    // Expo's default pause schedules a global session deactivation 100 ms
    // later. MPV is outside its registry, so keep that automatic path off
    // and release the session only when neither playback nor another theme
    // owner needs it. Recheck after the fade: video may have started meanwhile.
    if (!preserveAudioSession && !playbackHasAudio && ownerCount === 0) {
      await setIsAudioActiveAsync(false);
    }
  } catch {
    // ignore
  }

  if (sharedPlayer === player) {
    sharedPlayer = null;
    currentSongId = null;
  }
}

/** Begin cleanup idempotently; returns the shared promise. */
function beginCleanup(immediate = false): Promise<void> {
  if (immediate && cleanupPromise) {
    preserveAudioSession = true;
    activeFade?.cancel();
    // A fade started while browsing must also yield immediately to video.
    try {
      sharedPlayer?.pause();
    } catch {
      // The player may already have been released.
    }
  }
  if (!cleanupPromise) {
    preserveAudioSession = immediate;
    cleanupPromise = teardownSharedPlayer(immediate).finally(() => {
      cleanupPromise = null;
    });
  }
  return cleanupPromise;
}

export function useTVThemeMusic(itemId: string | undefined) {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();
  const { isActive: nativePlayerActive } = useNativePlayer();
  const playbackActive = isPlaybackActive(useSegments(), nativePlayerActive);
  const playbackActiveRef = useRef(playbackActive);
  useLayoutEffect(() => {
    playbackActiveRef.current = playbackActive;
    playbackHasAudio = playbackActive;
    if (playbackActive && cleanupPromise) void beginCleanup(true);
  }, [playbackActive]);

  const enabled =
    Platform.isTV &&
    !playbackActive &&
    !!api &&
    !!user?.Id &&
    !!itemId &&
    settings.tvThemeMusicEnabled;

  // Fetch theme songs
  const { data: themeSongs } = useQuery({
    queryKey: ["themeSongs", itemId],
    queryFn: async () => {
      const result = await getLibraryApi(api!).getThemeSongs({
        itemId: itemId!,
        userId: user!.Id!,
        inheritFromParent: true,
      });
      return result.data;
    },
    enabled,
    staleTime: TV_THEME_CACHE_MS,
  });

  // Load and play audio when theme songs are available and enabled
  useEffect(() => {
    if (!enabled || !themeSongs?.Items?.length || !api) {
      return;
    }

    const themeItem = themeSongs.Items[0];
    const songId = themeItem.Id!;

    ownerCount++;
    let mounted = true;

    const startPlayback = async () => {
      // If the same song is already playing, keep it going
      if (currentSongId === songId && sharedPlayer) {
        return;
      }

      // If a different song is playing (or cleanup is in progress), tear it down first
      if (sharedPlayer || cleanupPromise) {
        activeFade?.cancel();
        activeFade = null;
        await beginCleanup();
      }

      if (!mounted) return;

      const player = createAudioPlayer(null, { keepAudioSessionActive: true });
      sharedPlayer = player;
      currentSongId = songId;

      try {
        // Ordinary browsing cleanup explicitly releases the Expo session.
        await setIsAudioActiveAsync(true);
        if (!mounted || sharedPlayer !== player) return;
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        if (!mounted || sharedPlayer !== player) return;

        const params = new URLSearchParams({
          UserId: user!.Id!,
          DeviceId: api.deviceInfo.id ?? "",
          MaxStreamingBitrate: String(TV_THEME_MAX_BITRATE),
          Container: "mp3,aac,m4a|aac,m4b|aac,flac,wav",
          TranscodingContainer: "mp4",
          TranscodingProtocol: "http",
          AudioCodec: "aac",
          ApiKey: api.accessToken ?? "",
          EnableRedirection: "true",
          EnableRemoteMedia: "false",
        });
        const url = `${api.basePath}/Audio/${themeItem.Id}/universal?${params.toString()}`;
        player.replace({ uri: url });

        if (!mounted || sharedPlayer !== player) {
          player.pause();
          return;
        }

        player.loop = true;
        player.volume = 0;
        player.play();

        if (mounted && sharedPlayer === player) {
          const fade = fadeVolume(
            player,
            0,
            TV_THEME_VOLUME,
            TV_THEME_FADE_IN_MS,
          );
          activeFade = fade;
          await fade.promise;
          if (activeFade === fade) activeFade = null;
        }
      } catch (e) {
        console.warn("Theme music playback error:", e);
      }
    };

    startPlayback();

    // Cleanup: decrement owner count, defer teardown check
    return () => {
      mounted = false;
      ownerCount--;

      // Defer the check so React can finish processing both unmount + mount
      // in the same commit. If another instance mounts (same song), ownerCount
      // will be back to >0 and we skip teardown entirely.
      setTimeout(() => {
        if (ownerCount === 0) {
          beginCleanup(playbackActiveRef.current);
        }
      }, 0);
    };
  }, [enabled, themeSongs, api]);
}
