import { atom, useAtom } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

export type DownloadQuality = "original" | "high" | "low";

export type DownloadOption = {
  label: string;
  value: DownloadQuality;
};

export const ScreenOrientationEnum: Record<
  ScreenOrientation.OrientationLock,
  string
> = {
  [ScreenOrientation.OrientationLock.DEFAULT]: "Default",
  [ScreenOrientation.OrientationLock.ALL]: "All",
  [ScreenOrientation.OrientationLock.PORTRAIT]: "Portrait",
  [ScreenOrientation.OrientationLock.PORTRAIT_UP]: "Portrait Up",
  [ScreenOrientation.OrientationLock.PORTRAIT_DOWN]: "Portrait Down",
  [ScreenOrientation.OrientationLock.LANDSCAPE]: "Landscape",
  [ScreenOrientation.OrientationLock.LANDSCAPE_LEFT]: "Landscape Left",
  [ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT]: "Landscape Right",
  [ScreenOrientation.OrientationLock.OTHER]: "Other",
  [ScreenOrientation.OrientationLock.UNKNOWN]: "Unknown",
};

export const DownloadOptions: DownloadOption[] = [
  {
    label: "Original quality",
    value: "original",
  },
  {
    label: "High quality",
    value: "high",
  },
  {
    label: "Small file size",
    value: "low",
  },
];

export type LibraryOptions = {
  display: "row" | "list";
  cardStyle: "compact" | "detailed";
  imageStyle: "poster" | "cover";
  showTitles: boolean;
  showStats: boolean;
};

export type DefaultLanguageOption = {
  value: string;
  label: string;
};

export type Settings = {
  autoRotate?: boolean;
  forceLandscapeInVideoPlayer?: boolean;
  usePopularPlugin?: boolean;
  deviceProfile?: "Expo" | "Native" | "Old";
  mediaListCollectionIds?: string[];
  searchEngine: "Marlin" | "Jellyfin";
  marlinServerUrl?: string;
  openInVLC?: boolean;
  downloadQuality?: DownloadOption;
  libraryOptions: LibraryOptions;
  defaultSubtitleLanguage: DefaultLanguageOption | null;
  defaultAudioLanguage: DefaultLanguageOption | null;
  showHomeTitles: boolean;
  defaultVideoOrientation: ScreenOrientation.OrientationLock;
  forwardSkipTime: number;
  rewindSkipTime: number;
  optimizedVersionsServerUrl?: string | null;
  downloadMethod: "optimized" | "remux";
  autoDownload: boolean;
};
/**
 *
 * The settings atom is a Jotai atom that stores the user's settings.
 * It is initialized with a default value of null, which indicates that the settings have not been loaded yet.
 * The settings are loaded from AsyncStorage when the atom is read for the first time.
 *
 */

const loadSettings = async (): Promise<Settings> => {
  const defaultValues: Settings = {
    autoRotate: true,
    forceLandscapeInVideoPlayer: false,
    usePopularPlugin: false,
    deviceProfile: "Expo",
    mediaListCollectionIds: [],
    searchEngine: "Jellyfin",
    marlinServerUrl: "",
    openInVLC: false,
    downloadQuality: DownloadOptions[0],
    libraryOptions: {
      display: "list",
      cardStyle: "detailed",
      imageStyle: "cover",
      showTitles: true,
      showStats: true,
    },
    defaultAudioLanguage: null,
    defaultSubtitleLanguage: null,
    showHomeTitles: true,
    defaultVideoOrientation: ScreenOrientation.OrientationLock.DEFAULT,
    forwardSkipTime: 30,
    rewindSkipTime: 10,
    optimizedVersionsServerUrl: null,
    downloadMethod: "remux",
    autoDownload: false,
  };

  try {
    const jsonValue = await AsyncStorage.getItem("settings");
    const loadedValues: Partial<Settings> =
      jsonValue != null ? JSON.parse(jsonValue) : {};

    return { ...defaultValues, ...loadedValues };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return defaultValues;
  }
};

// Utility function to save settings to AsyncStorage
const saveSettings = async (settings: Settings) => {
  const jsonValue = JSON.stringify(settings);
  await AsyncStorage.setItem("settings", jsonValue);
};

// Create an atom to store the settings in memory
export const settingsAtom = atom<Settings | null>(null);

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
