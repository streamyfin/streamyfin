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
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { apiAtom } from "@/providers/JellyfinProvider";
import { type Settings, useSettings } from "@/utils/atoms/settings";
import {
  ORIGINAL_LANGUAGE,
  supportsOriginalAudioLanguage,
} from "@/utils/jellyfin/serverVersion";

interface MediaContextType {
  settings: Settings | null;
  updateSettings: (update: Partial<Settings>) => void;
  user: UserDto | undefined;
  cultures: CultureDto[];
  supportsOriginalAudioLanguage: boolean;
  isReady: boolean;
}

/**
 * Translate a settings update into the matching `UserConfiguration` fields.
 *
 * Only the keys actually present in the update are carried: everything else is
 * left to the server copy the caller merges on top of. Rebuilding the whole
 * configuration from local state would let an unrelated write clear a
 * preference the app never had a value for.
 */
const toUserConfiguration = (update: Partial<Settings>) => {
  const configuration: Partial<UserConfiguration> = {};
  if ("subtitleMode" in update)
    configuration.SubtitleMode = update.subtitleMode;
  if ("playDefaultAudioTrack" in update)
    configuration.PlayDefaultAudioTrack = update.playDefaultAudioTrack;
  if ("rememberAudioSelections" in update)
    configuration.RememberAudioSelections = update.rememberAudioSelections;
  if ("rememberSubtitleSelections" in update)
    configuration.RememberSubtitleSelections =
      update.rememberSubtitleSelections;
  if ("defaultAudioLanguage" in update)
    configuration.AudioLanguagePreference =
      update.defaultAudioLanguage?.ThreeLetterISOLanguageName ?? "";
  if ("defaultSubtitleLanguage" in update)
    configuration.SubtitleLanguagePreference =
      update.defaultSubtitleLanguage?.ThreeLetterISOLanguageName ?? "";
  return configuration;
};

// Stable reference so a pending cultures query does not churn effect deps.
const EMPTY_CULTURES: CultureDto[] = [];

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const useMedia = () => {
  const context = useContext(MediaContext);
  if (!context) {
    throw new Error("useMedia must be used within a MediaProvider");
  }
  return context;
};

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const api = useAtomValue(apiAtom);
  const queryClient = useNetworkAwareQueryClient();

  const { data: user } = useQuery({
    queryKey: ["authUser"],
    queryFn: async () => {
      if (!api) return;
      const userApi = await getUserApi(api).getCurrentUser();
      return userApi.data;
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
        const localizationApi = await getLocalizationApi(api).getCultures();
        const cultures = localizationApi.data;
        return cultures;
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
  const updateUserConfiguration = async (
    configuration: Partial<UserConfiguration>,
    { invalidateItems = false }: { invalidateItems?: boolean } = {},
  ) => {
    if (!api || !user) return;
    try {
      await getUserApi(api).updateUserConfiguration({
        userConfiguration: {
          ...user.Configuration,
          ...configuration,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["authUser"] });
      if (invalidateItems) {
        // Audio/subtitle preferences feed the server-computed
        // DefaultAudio/SubtitleStreamIndex carried by each item's MediaSources.
        queryClient.invalidateQueries({ queryKey: ["item"] });
      }
    } catch (_error) {}
  };

  const updateSettingsWrapper = (update: Partial<Settings>) => {
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

    const configuration = toUserConfiguration(nextUpdate);
    if (Object.keys(configuration).length === 0) return;

    updateUserConfiguration(configuration, { invalidateItems: true });
  };

  // Seed the local settings from the server-side user configuration.
  useEffect(() => {
    if (!isReady || !user) return;
    const userSubtitlePreference =
      user.Configuration?.SubtitleLanguagePreference;
    const userAudioPreference = user.Configuration?.AudioLanguagePreference;

    const subtitlePreference = cultures.find(
      (x) => x.ThreeLetterISOLanguageName === userSubtitlePreference,
    );
    const audioPreference =
      userAudioPreference === ORIGINAL_LANGUAGE && supportsOriginalLanguage
        ? { ThreeLetterISOLanguageName: ORIGINAL_LANGUAGE }
        : cultures.find(
            (x) => x.ThreeLetterISOLanguageName === userAudioPreference,
          );

    // A server carrying both the original-language preference and
    // PlayDefaultAudioTrack keeps falling back to the default-flagged stream.
    // Correct it server-side, but never at the cost of the other preferences:
    // the write below only carries that single field.
    const correctsPlayDefaultAudioTrack =
      supportsOriginalLanguage &&
      userAudioPreference === ORIGINAL_LANGUAGE &&
      user.Configuration?.PlayDefaultAudioTrack === true &&
      !pluginSettings?.playDefaultAudioTrack?.locked;

    updateSettings({
      defaultSubtitleLanguage: subtitlePreference,
      defaultAudioLanguage: audioPreference,
      subtitleMode: user.Configuration?.SubtitleMode,
      playDefaultAudioTrack: correctsPlayDefaultAudioTrack
        ? false
        : user.Configuration?.PlayDefaultAudioTrack,
      rememberAudioSelections: user.Configuration?.RememberAudioSelections,
      rememberSubtitleSelections:
        user.Configuration?.RememberSubtitleSelections,
    });

    if (correctsPlayDefaultAudioTrack) {
      updateUserConfiguration(
        { PlayDefaultAudioTrack: false },
        { invalidateItems: true },
      );
    }
  }, [user, isReady, cultures, supportsOriginalLanguage]);

  if (!api) return null;

  return (
    <MediaContext.Provider
      value={{
        settings,
        updateSettings: updateSettingsWrapper,
        user,
        cultures,
        supportsOriginalAudioLanguage: supportsOriginalLanguage,
        isReady,
      }}
    >
      {children}
    </MediaContext.Provider>
  );
};
