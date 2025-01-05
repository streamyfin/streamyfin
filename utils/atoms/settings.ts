import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { getLocales } from "expo-localization";
import * as ScreenOrientation from "expo-screen-orientation";
import { storage } from "../mmkv";
import { Platform } from "react-native";
import {
  CultureDto,
  SubtitlePlaybackMode,
} from "@jellyfin/sdk/lib/generated-client";

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
  preferedLanguage?: string;
  searchEngine: "Marlin" | "Jellyfin";
  marlinServerUrl?: string;
  openInVLC?: boolean;
  downloadQuality?: DownloadOption;
  libraryOptions: LibraryOptions;
  defaultAudioLanguage: CultureDto | null;
  playDefaultAudioTrack: boolean;
  rememberAudioSelections: boolean;
  defaultSubtitleLanguage: CultureDto | null;
  subtitleMode: SubtitlePlaybackMode;
  rememberSubtitleSelections: boolean;
  showHomeTitles: boolean;
  defaultVideoOrientation: ScreenOrientation.OrientationLock;
  forwardSkipTime: number;
  rewindSkipTime: number;
  optimizedVersionsServerUrl?: string | null;
  downloadMethod: "optimized" | "remux";
  autoDownload: boolean;
  showCustomMenuLinks: boolean;
  disableHapticFeedback: boolean;
  subtitleSize: number;
  remuxConcurrentLimit: 1 | 2 | 3 | 4;
  safeAreaInControlsEnabled: boolean;
  jellyseerrServerUrl?: string;
};

const loadSettings = (): Settings => {
  const defaultValues: Settings = {
    autoRotate: true,
    forceLandscapeInVideoPlayer: false,
    usePopularPlugin: false,
    deviceProfile: "Expo",
    mediaListCollectionIds: [],
    preferedLanguage: undefined,
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
    playDefaultAudioTrack: true,
    rememberAudioSelections: true,
    defaultSubtitleLanguage: null,
    subtitleMode: SubtitlePlaybackMode.Default,
    rememberSubtitleSelections: true,
    showHomeTitles: true,
    defaultVideoOrientation: ScreenOrientation.OrientationLock.DEFAULT,
    forwardSkipTime: 30,
    rewindSkipTime: 10,
    optimizedVersionsServerUrl: null,
    downloadMethod: "remux",
    autoDownload: false,
    showCustomMenuLinks: false,
    disableHapticFeedback: false,
    subtitleSize: Platform.OS === "ios" ? 60 : 100,
    remuxConcurrentLimit: 1,
    safeAreaInControlsEnabled: true,
    jellyseerrServerUrl: undefined,
  };

  try {
    const jsonValue = storage.getString("settings");
    const loadedValues: Partial<Settings> =
      jsonValue != null ? JSON.parse(jsonValue) : {};

    return { ...defaultValues, ...loadedValues };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return defaultValues;
  }
};

const saveSettings = (settings: Settings) => {
  const jsonValue = JSON.stringify(settings);
  storage.set("settings", jsonValue);
};

export const settingsAtom = atom<Settings | null>(null);

export const useSettings = () => {
  const [settings, setSettings] = useAtom(settingsAtom);

  useEffect(() => {
    if (settings === null) {
      const loadedSettings = loadSettings();
      setSettings(loadedSettings);
    }
  }, [settings, setSettings]);

  const updateSettings = (update: Partial<Settings>) => {
    if (settings) {
      const newSettings = { ...settings, ...update };

      setSettings(newSettings);
      saveSettings(newSettings);
    }
  };

  return [settings, updateSettings] as const;
};
