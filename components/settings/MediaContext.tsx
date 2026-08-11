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
import { supportsOriginalAudioLanguage } from "@/utils/jellyfin/serverVersion";

interface MediaContextType {
  settings: Settings | null;
  updateSettings: (update: Partial<Settings>) => void;
  user: UserDto | undefined;
  cultures: CultureDto[];
  supportsOriginalAudioLanguage: boolean;
  isReady: boolean;
}

export const ORIGINAL_LANGUAGE = "OriginalLanguage";

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

  const updateSetingsWrapper = (update: Partial<Settings>) => {
    if (
      !isReady ||
      ("defaultAudioLanguage" in update &&
        (pluginSettings?.defaultAudioLanguage?.locked ||
          pluginSettings?.playDefaultAudioTrack?.locked)) ||
      ("playDefaultAudioTrack" in update &&
        pluginSettings?.playDefaultAudioTrack?.locked)
    )
      return;

    if (
      update.defaultAudioLanguage?.ThreeLetterISOLanguageName ===
      ORIGINAL_LANGUAGE
    ) {
      update = { ...update, playDefaultAudioTrack: false };
    } else if (update.defaultAudioLanguage === null) {
      update = { ...update, playDefaultAudioTrack: true };
    }

    const updateUserConfiguration = async (
      update: Partial<UserConfiguration>,
    ) => {
      if (api && user) {
        try {
          await getUserApi(api).updateUserConfiguration({
            userConfiguration: {
              ...user.Configuration,
              ...update,
            },
          });
          queryClient.invalidateQueries({ queryKey: ["authUser"] });
          queryClient.invalidateQueries({ queryKey: ["item"] });
        } catch (_error) {}
      }
    };

    updateSettings(update);

    const updatePayload = {
      SubtitleMode: update?.subtitleMode ?? settings?.subtitleMode,
      PlayDefaultAudioTrack:
        update?.playDefaultAudioTrack ?? settings?.playDefaultAudioTrack,
      RememberAudioSelections:
        update?.rememberAudioSelections ?? settings?.rememberAudioSelections,
      RememberSubtitleSelections:
        update?.rememberSubtitleSelections ??
        settings?.rememberSubtitleSelections,
    } as Partial<UserConfiguration>;

    updatePayload.AudioLanguagePreference =
      update?.defaultAudioLanguage === null
        ? ""
        : update?.defaultAudioLanguage?.ThreeLetterISOLanguageName ||
          settings?.defaultAudioLanguage?.ThreeLetterISOLanguageName ||
          "";

    updatePayload.SubtitleLanguagePreference =
      update?.defaultSubtitleLanguage === null
        ? ""
        : update?.defaultSubtitleLanguage?.ThreeLetterISOLanguageName ||
          settings?.defaultSubtitleLanguage?.ThreeLetterISOLanguageName ||
          "";

    updateUserConfiguration(updatePayload);
  };

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

  const { data: serverInfo, isSuccess: isServerInfoAvailable } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo> => {
      if (!api) return {};
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api,
    staleTime: 43200000,
  });
  const supportsOriginalLanguage =
    isServerInfoAvailable && supportsOriginalAudioLanguage(serverInfo?.Version);

  const { data: cultures = [] } = useQuery({
    queryKey: ["cultures"],
    queryFn: async () => {
      if (!api) return [];
      const localizationApi = await getLocalizationApi(api).getCultures();
      const cultures = localizationApi.data;
      return cultures;
    },
    enabled: !!api,
    staleTime: 43200000, // 12 hours
  });

  const isReady = !!user && isServerInfoAvailable && cultures.length > 0;

  // Set default settings from user configuration.s
  useEffect(() => {
    if (!isReady) return;
    const userSubtitlePreference =
      user?.Configuration?.SubtitleLanguagePreference;
    const userAudioPreference = user?.Configuration?.AudioLanguagePreference;

    const subtitlePreference = cultures.find(
      (x) => x.ThreeLetterISOLanguageName === userSubtitlePreference,
    );
    const audioPreference =
      userAudioPreference === ORIGINAL_LANGUAGE && supportsOriginalLanguage
        ? { ThreeLetterISOLanguageName: ORIGINAL_LANGUAGE }
        : cultures.find(
            (x) => x.ThreeLetterISOLanguageName === userAudioPreference,
          );

    if (
      supportsOriginalLanguage &&
      userAudioPreference === ORIGINAL_LANGUAGE &&
      user.Configuration?.PlayDefaultAudioTrack
    ) {
      updateSetingsWrapper({ defaultAudioLanguage: audioPreference });
      return;
    }

    updateSettings({
      defaultSubtitleLanguage: subtitlePreference,
      defaultAudioLanguage: audioPreference,
      subtitleMode: user?.Configuration?.SubtitleMode,
      playDefaultAudioTrack: user?.Configuration?.PlayDefaultAudioTrack,
      rememberAudioSelections: user?.Configuration?.RememberAudioSelections,
      rememberSubtitleSelections:
        user?.Configuration?.RememberSubtitleSelections,
    });
  }, [user, isReady, cultures, supportsOriginalLanguage]);

  if (!api) return null;

  return (
    <MediaContext.Provider
      value={{
        settings,
        updateSettings: updateSetingsWrapper,
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
