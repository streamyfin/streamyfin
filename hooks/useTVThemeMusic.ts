import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import {
  type AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { Platform } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

const TARGET_VOLUME = 0.3;
const FADE_IN_DURATION = 2000;
const FADE_OUT_DURATION = 1000;
const FADE_STEP_MS = 50;

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

  const steps = Math.max(1, Math.floor(duration / FADE_STEP_MS));
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
        setTimeout(tick, FADE_STEP_MS);
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

/** Fade out, stop, and release the shared player. */
async function teardownSharedPlayer(): Promise<void> {
  const player = sharedPlayer;
  if (!player) return;

  activeFade?.cancel();
  activeFade = null;

  try {
    if (player.isLoaded) {
      const currentVolume = player.volume ?? TARGET_VOLUME;
      const fade = fadeVolume(player, currentVolume, 0, FADE_OUT_DURATION);
      activeFade = fade;
      await fade.promise;
      activeFade = null;
      player.pause();
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
function beginCleanup(): Promise<void> {
  if (!cleanupPromise) {
    cleanupPromise = teardownSharedPlayer().finally(() => {
      cleanupPromise = null;
    });
  }
  return cleanupPromise;
}

export function useTVThemeMusic(itemId: string | undefined) {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();

  const enabled =
    Platform.isTV &&
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
    staleTime: 5 * 60 * 1000,
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

      const player = createAudioPlayer(null);
      sharedPlayer = player;
      currentSongId = songId;

      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });

        const params = new URLSearchParams({
          UserId: user!.Id!,
          DeviceId: api.deviceInfo.id ?? "",
          MaxStreamingBitrate: "140000000",
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
          const fade = fadeVolume(player, 0, TARGET_VOLUME, FADE_IN_DURATION);
          activeFade = fade;
          await fade.promise;
          activeFade = null;
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
          beginCleanup();
        }
      }, 0);
    };
  }, [enabled, themeSongs, api]);
}
