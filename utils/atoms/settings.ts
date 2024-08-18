import { atom, useAtom } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { getLocales } from "expo-localization";

type Settings = {
  autoRotate?: boolean;
  forceLandscapeInVideoPlayer?: boolean;
  openFullScreenVideoPlayerByDefault?: boolean;
  usePopularPlugin?: boolean;
  deviceProfile?: "Expo" | "Native" | "Old";
  forceDirectPlay?: boolean;
  mediaListCollectionIds?: string[];
  preferedLanguage?: string;
};

/**
 *
 * The settings atom is a Jotai atom that stores the user's settings.
 * It is initialized with a default value of null, which indicates that the settings have not been loaded yet.
 * The settings are loaded from AsyncStorage when the atom is read for the first time.
 *
 */

// Utility function to load settings from AsyncStorage
const loadSettings = async (): Promise<Settings> => {
  const jsonValue = await AsyncStorage.getItem("settings");
  return jsonValue != null
    ? JSON.parse(jsonValue)
    : {
        autoRotate: true,
        forceLandscapeInVideoPlayer: false,
        openFullScreenVideoPlayerByDefault: false,
        usePopularPlugin: false,
        deviceProfile: "Expo",
        forceDirectPlay: false,
        mediaListCollectionIds: [],
        preferedLanguage: getLocales()[0] || "en",
      };
};

// Utility function to save settings to AsyncStorage
const saveSettings = async (settings: Settings) => {
  const jsonValue = JSON.stringify(settings);
  await AsyncStorage.setItem("settings", jsonValue);
};

// Create an atom to store the settings in memory
const settingsAtom = atom<Settings | null>(null);

// A hook to manage settings, loading them on initial mount and providing a way to update them
export const useSettings = () => {
  const [settings, setSettings] = useAtom(settingsAtom);

  useEffect(() => {
    if (settings === null) {
      loadSettings().then(setSettings);
    }
  }, [settings, setSettings]);

  const updateSettings = async (update: Partial<Settings>) => {
    if (settings) {
      const newSettings = { ...settings, ...update };
      setSettings(newSettings);
      await saveSettings(newSettings);
    }
  };

  return [settings, updateSettings] as const;
};
