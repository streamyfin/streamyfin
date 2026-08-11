import type {
  CultureDto,
  PublicSystemInfo,
  UserConfiguration,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getLocalizationApi,
  getSystemApi,
  getUserApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { apiAtom } from "@/providers/JellyfinProvider";
import { type Settings, useSettings } from "@/utils/atoms/settings";
import {
  ORIGINAL_LANGUAGE,
  supportsOriginalAudioLanguage,
} from "@/utils/jellyfin/serverVersion";
import { buildUserConfigurationPayload } from "@/utils/jellyfin/userConfiguration";

/**
 * The settings that are not really Streamyfin's own: they mirror fields of the
 * Jellyfin user profile.
 *
 * Streamyfin keeps a local copy because it resolves tracks client-side — for
 * offline downloads, on the item page before any stream is negotiated, and
 * across three playback engines — none of which can wait on the server's
 * PlaybackInfo answer. jellyfin-web needs no local copy because it does no
 * selection of its own; it just renders whatever DefaultAudioStreamIndex /
 * DefaultSubtitleStreamIndex the server computed.
 *
 * The local copy is therefore a cache, not a second setting, and everything
 * that writes one of these keys must write through {@link useMediaPreferences}
 * so the two stay in step.
 */
const SERVER_BACKED_KEYS = [
  "subtitleMode",
  "playDefaultAudioTrack",
  "rememberAudioSelections",
  "rememberSubtitleSelections",
  "defaultAudioLanguage",
  "defaultSubtitleLanguage",
] as const;

export type ServerBackedSetting = (typeof SERVER_BACKED_KEYS)[number];

// Stable reference so a pending cultures query does not churn effect deps.
const EMPTY_CULTURES: CultureDto[] = [];

export interface MediaPreferences {
  settings: Settings | null;
  /** Writes locally *and* mirrors the change to the Jellyfin user profile. */
  updateMediaSettings: (update: Partial<Settings>) => void;
  user: UserDto | undefined;
  cultures: CultureDto[];
  /** The server is new enough to resolve the original-language audio track. */
  supportsOriginalAudioLanguage: boolean;
  /** Every query the audio-language controls depend on has answered. */
  isReady: boolean;
}

/**
 * Two-way binding between the local settings atom and the Jellyfin user
 * profile: seeds the local copy from the server on mount, and mirrors local
 * edits back.
 *
 * Shared by the mobile settings screens (via MediaProvider) and the TV settings
 * screen, which has no provider of its own — without a single owner the two
 * platforms drift, which is exactly how an Apple TV ends up resolving tracks
 * from a preference the phone had already set on the server.
 */
export function useMediaPreferences(): MediaPreferences {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const api = useAtomValue(apiAtom);
  const queryClient = useNetworkAwareQueryClient();

  const { data: user } = useQuery({
    queryKey: ["authUser"],
    queryFn: async () => {
      if (!api) return;
      const res = await getUserApi(api).getCurrentUser();
      return res.data;
    },
    enabled: !!api,
    staleTime: 0,
  });

  // Kept aligned with the other consumers of this key (useJellyfinServerId,
  // the Streamystats components): same shape, same nullable contract.
  const { data: serverInfo, isSuccess: isServerInfoAvailable } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api,
    staleTime: 43200000, // 12 hours
  });
  const supportsOriginalLanguage =
    isServerInfoAvailable && supportsOriginalAudioLanguage(serverInfo?.Version);

  const { data: cultures = EMPTY_CULTURES, isSuccess: areCulturesAvailable } =
    useQuery({
      queryKey: ["cultures"],
      queryFn: async () => {
        if (!api) return EMPTY_CULTURES;
        const res = await getLocalizationApi(api).getCultures();
        return res.data;
      },
      enabled: !!api,
      staleTime: 43200000, // 12 hours
    });

  // Keyed on the queries having answered, not on the payload being non-empty:
  // a server legitimately returning no culture would otherwise pin the audio
  // settings in their loading state forever.
  const isReady = !!user && isServerInfoAvailable && areCulturesAvailable;

  /**
   * Apply a partial configuration on top of the server's own copy, so
   * preferences this client did not touch are never overwritten.
   */
  const updateUserConfiguration = useCallback(
    async (
      configuration: Partial<UserConfiguration>,
      { invalidateItems = false }: { invalidateItems?: boolean } = {},
    ) => {
      if (!api || !user) return;
      try {
        await getUserApi(api).updateUserConfiguration({
          userConfiguration: { ...user.Configuration, ...configuration },
        });
        queryClient.invalidateQueries({ queryKey: ["authUser"] });
        if (invalidateItems) {
          // Audio/subtitle preferences feed the server-computed
          // DefaultAudio/SubtitleStreamIndex carried by each item's MediaSources.
          queryClient.invalidateQueries({ queryKey: ["item"] });
        }
      } catch {
        // Offline or a server that rejects the write: the local copy still
        // applies, and the next mount re-seeds from whatever the server has.
      }
    },
    [api, user, queryClient],
  );

  const updateMediaSettings = useCallback(
    (update: Partial<Settings>) => {
      // Admin-locked audio keys must reach neither local storage nor the server.
      if (
        ("defaultAudioLanguage" in update &&
          (pluginSettings?.defaultAudioLanguage?.locked ||
            pluginSettings?.playDefaultAudioTrack?.locked)) ||
        ("playDefaultAudioTrack" in update &&
          pluginSettings?.playDefaultAudioTrack?.locked)
      ) {
        return;
      }

      // The audio-language write depends on the cultures list and on the server
      // version gate, so it waits for them. Every other setting, including the
      // client-only subtitle appearance ones, stays writable meanwhile.
      if ("defaultAudioLanguage" in update && !isReady) return;

      let nextUpdate = update;
      if ("defaultAudioLanguage" in update) {
        const picksOriginal =
          update.defaultAudioLanguage?.ThreeLetterISOLanguageName ===
          ORIGINAL_LANGUAGE;
        const clearsPreference = update.defaultAudioLanguage === null;
        const leavesOriginal =
          !picksOriginal &&
          supportsOriginalLanguage &&
          settings?.defaultAudioLanguage?.ThreeLetterISOLanguageName ===
            ORIGINAL_LANGUAGE;

        // Jellyfin short-circuits to the default-flagged stream when
        // PlayDefaultAudioTrack is set, which defeats the original-language pick
        // (MediaStreamSelector.GetDefaultAudioStreamIndex).
        if (picksOriginal) {
          nextUpdate = { ...update, playDefaultAudioTrack: false };
        } else if (leavesOriginal && clearsPreference) {
          // Restore the Jellyfin default only when the preference is cleared for
          // good. Switching straight to a real language keeps the flag off, since
          // turning it back on would send the server back to the default-flagged
          // stream and ignore the language that was just picked.
          nextUpdate = { ...update, playDefaultAudioTrack: true };
        }
      }

      updateSettings(nextUpdate);

      const configuration = buildUserConfigurationPayload(nextUpdate);
      if (Object.keys(configuration).length === 0) return;
      void updateUserConfiguration(configuration, { invalidateItems: true });
    },
    [
      isReady,
      pluginSettings?.defaultAudioLanguage?.locked,
      pluginSettings?.playDefaultAudioTrack?.locked,
      settings,
      supportsOriginalLanguage,
      updateSettings,
      updateUserConfiguration,
    ],
  );

  // Seed the local copy from the server profile — once per user, not once per
  // refetch.
  //
  // `updateMediaSettings` invalidates ["authUser"], so every edit produces a
  // fresh `user` object moments later. Seeding on that would write the server's
  // value back over the change the user just made: the control flips and then
  // snaps back, which is indistinguishable from a dead control. Seeding is a
  // session-start concern, so it keys off the user's identity instead.
  //
  // The lock state is part of the key because unlocking `playDefaultAudioTrack`
  // is what makes the original-language correction below permissible: without it
  // an admin unlocking the key mid-session would leave the server uncorrected
  // until the next launch.
  const playDefaultAudioTrackLocked =
    pluginSettings?.playDefaultAudioTrack?.locked;
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isReady || !user?.Id) return;
    const seedKey = `${user.Id}:${playDefaultAudioTrackLocked ?? false}`;
    if (seededFor.current === seedKey) return;
    seededFor.current = seedKey;

    const config = user.Configuration;
    const userAudioPreference = config?.AudioLanguagePreference;
    const findCulture = (code: string | null | undefined) =>
      code
        ? cultures.find((c) => c.ThreeLetterISOLanguageName === code)
        : undefined;

    // A server carrying both the original-language preference and
    // PlayDefaultAudioTrack keeps falling back to the default-flagged stream.
    // Correct it server-side, but never at the cost of the other preferences:
    // the write below only carries that single field.
    const correctsPlayDefaultAudioTrack =
      supportsOriginalLanguage &&
      userAudioPreference === ORIGINAL_LANGUAGE &&
      config?.PlayDefaultAudioTrack === true &&
      !playDefaultAudioTrackLocked;

    // Only keys the server actually sent. Spreading an absent field in as
    // `undefined` would blank a perfectly good local value — and a toggle whose
    // value is `undefined` renders off and refuses to stay on.
    const seed: Partial<Settings> = {};
    if (config?.SubtitleLanguagePreference !== undefined) {
      seed.defaultSubtitleLanguage = findCulture(
        config.SubtitleLanguagePreference,
      );
    }
    if (userAudioPreference !== undefined) {
      // The original-language sentinel is not an ISO code and so is absent from
      // the cultures list — it has to be carried through as-is.
      seed.defaultAudioLanguage =
        userAudioPreference === ORIGINAL_LANGUAGE && supportsOriginalLanguage
          ? ({ ThreeLetterISOLanguageName: ORIGINAL_LANGUAGE } as CultureDto)
          : findCulture(userAudioPreference);
    }
    if (config?.SubtitleMode !== undefined) {
      seed.subtitleMode = config.SubtitleMode;
    }
    if (config?.PlayDefaultAudioTrack !== undefined) {
      seed.playDefaultAudioTrack = correctsPlayDefaultAudioTrack
        ? false
        : config.PlayDefaultAudioTrack;
    }
    if (config?.RememberAudioSelections !== undefined) {
      seed.rememberAudioSelections = config.RememberAudioSelections;
    }
    if (config?.RememberSubtitleSelections !== undefined) {
      seed.rememberSubtitleSelections = config.RememberSubtitleSelections;
    }

    if (Object.keys(seed).length > 0) updateSettings(seed);

    if (correctsPlayDefaultAudioTrack) {
      void updateUserConfiguration(
        { PlayDefaultAudioTrack: false },
        { invalidateItems: true },
      );
    }
    // updateSettings is intentionally omitted: it is recreated on every settings
    // write, and depending on it would re-run this effect on our own writes.
  }, [
    user,
    isReady,
    cultures,
    supportsOriginalLanguage,
    playDefaultAudioTrackLocked,
    updateUserConfiguration,
  ]);

  return {
    settings,
    updateMediaSettings,
    user,
    cultures,
    supportsOriginalAudioLanguage: supportsOriginalLanguage,
    isReady,
  };
}
