import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import type { Audio as AudioType } from "expo-av";
import { Audio } from "expo-av";
import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
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
  sound: AudioType.Sound,
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
          sound.setVolumeAsync(to).catch(() => {});
        }
        resolve();
        return;
      }
      step++;
      current += delta;
      sound
        .setVolumeAsync(Math.max(0, Math.min(1, current)))
        .catch(() => {})
        .then(() => {
          if (!cancelled) {
            setTimeout(tick, FADE_STEP_MS);
          } else {
            resolve();
          }
        });
    };

    tick();
  });

  return { promise, cancel };
}

export function useTVThemeMusic(itemId: string | undefined) {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();
  const soundRef = useRef<AudioType.Sound | null>(null);
  const fadeRef = useRef<{ cancel: () => void } | null>(null);

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

    let mounted = true;
    const sound = new Audio.Sound();
    soundRef.current = sound;

    const loadAndPlay = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
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
        await sound.loadAsync({ uri: url });
        if (!mounted) {
          await sound.unloadAsync();
          return;
        }
        await sound.setIsLoopingAsync(true);
        await sound.setVolumeAsync(0);
        await sound.playAsync();
        if (mounted) {
          // Fade in
          const fade = fadeVolume(sound, 0, TARGET_VOLUME, FADE_IN_DURATION);
          fadeRef.current = fade;
          await fade.promise;
        }
      } catch (e) {
        console.warn("Theme music playback error:", e);
      }
    };

    loadAndPlay();

    // Cleanup: fade out then unload
    return () => {
      mounted = false;
      // Cancel any in-progress fade
      fadeRef.current?.cancel();
      fadeRef.current = null;

      const cleanupSound = async () => {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            const currentVolume = status.volume ?? TARGET_VOLUME;
            const fade = fadeVolume(sound, currentVolume, 0, FADE_OUT_DURATION);
            await fade.promise;
            await sound.stopAsync();
            await sound.unloadAsync();
          }
        } catch {
          // Sound may already be unloaded
          try {
            await sound.unloadAsync();
          } catch {
            // ignore
          }
        }
      };

      cleanupSound();
      soundRef.current = null;
    };
  }, [enabled, themeSongs, api]);
}
