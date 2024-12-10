import { Settings, useSettings } from "@/utils/atoms/settings";
import { useAtomValue } from "jotai";
import React, { createContext, useContext, ReactNode, useEffect } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getLocalizationApi, getUserApi } from "@jellyfin/sdk/lib/utils/api";
import {
  CultureDto,
  UserDto,
  UserConfiguration,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface MediaContextType {
  settings: any;
  updateSettings: any;
  user: UserDto | undefined;
  cultures: CultureDto[];
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const useMedia = () => {
  const context = useContext(MediaContext);
  if (!context) {
    throw new Error("useMedia must be used within a MediaProvider");
  }
  return context;
};

export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const [settings, updateSettings] = useSettings();
  const api = useAtomValue(apiAtom);
  const queryClient = useQueryClient();

  const updateSetingsWrapper = (update: Partial<Settings>) => {
    const updateUserConfiguration = async (
      update: Partial<UserConfiguration>
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
        } catch (error) {}
      }
    };

    updateSettings(update);

    console.log("update", update);

    let updatePayload = {} as Partial<UserConfiguration>;

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

    console.log("updatePayload", updatePayload);

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
    refetchOnMount: true,
  });

  const { data: cultures = [] } = useQuery({
    queryKey: ["cultures"],
    queryFn: async () => {
      if (!api) return [];
      const localizationApi = await getLocalizationApi(api).getCultures();
      const cultures = localizationApi.data;
      return cultures;
    },
    enabled: !!api,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Set default settings from user configuration.s
  useEffect(() => {
    const userSubtitlePreference =
      user?.Configuration?.SubtitleLanguagePreference;
    const userAudioPreference = user?.Configuration?.AudioLanguagePreference;

    const subtitlePreference = cultures.find(
      (x) => x.ThreeLetterISOLanguageName === userSubtitlePreference
    );
    const audioPreference = cultures.find(
      (x) => x.ThreeLetterISOLanguageName === userAudioPreference
    );

    updateSettings({
      defaultSubtitleLanguage: subtitlePreference,
      defaultAudioLanguage: audioPreference,
    });
  }, [user, cultures]);

  if (!api) return null;

  return (
    <MediaContext.Provider
      value={{
        settings,
        updateSettings: updateSetingsWrapper,
        user,
        cultures,
      }}
    >
      {children}
    </MediaContext.Provider>
  );
};
