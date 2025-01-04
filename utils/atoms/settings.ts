import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { storage } from "../mmkv";
import { Platform } from "react-native";
import {
  CultureDto,
  SubtitlePlaybackMode,
} from "@jellyfin/sdk/lib/generated-client";

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
  libraryOptions: LibraryOptions;
  defaultAudioLanguage: CultureDto | null;
  playDefaultAudioTrack: boolean;
  rememberAudioSelections: boolean;
  defaultSubtitleLanguage: CultureDto | null;
  subtitleMode: SubtitlePlaybackMode;
  rememberSubtitleSelections: boolean;
  showHomeTitles: boolean;
  forwardSkipTime: number;
  rewindSkipTime: number;
  optimizedVersionsServerUrl?: string | null;
  showCustomMenuLinks: boolean;
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
    searchEngine: "Jellyfin",
    marlinServerUrl: "",
    openInVLC: false,
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
    forwardSkipTime: 30,
    rewindSkipTime: 10,
    optimizedVersionsServerUrl: null,
    showCustomMenuLinks: false,
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
