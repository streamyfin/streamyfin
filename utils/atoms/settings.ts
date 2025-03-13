import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { storage } from "../mmkv";
import { Platform } from "react-native";
import {
  CultureDto,
  SubtitlePlaybackMode,
  ItemSortBy,
  SortOrder,
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client";
import { Bitrate, BITRATES } from "@/components/BitrateSelector";
import { apiAtom } from "@/providers/JellyfinProvider";
import { writeInfoLog } from "@/utils/log";
import { Video } from "@/utils/jellyseerr/server/models/Movie";

const STREAMYFIN_PLUGIN_ID = "1e9e5d386e6746158719e98a5c34f004";
const STREAMYFIN_PLUGIN_SETTINGS = "STREAMYFIN_PLUGIN_SETTINGS";

export type DownloadQuality = "original" | "high" | "low";

export type DownloadOption = {
  label: string;
  value: DownloadQuality;
};

export const ScreenOrientationEnum: Record<
  ScreenOrientation.OrientationLock,
  string
> = {
  [ScreenOrientation.OrientationLock.DEFAULT]:
    "home.settings.other.orientations.DEFAULT",
  [ScreenOrientation.OrientationLock.ALL]:
    "home.settings.other.orientations.ALL",
  [ScreenOrientation.OrientationLock.PORTRAIT]:
    "home.settings.other.orientations.PORTRAIT",
  [ScreenOrientation.OrientationLock.PORTRAIT_UP]:
    "home.settings.other.orientations.PORTRAIT_UP",
  [ScreenOrientation.OrientationLock.PORTRAIT_DOWN]:
    "home.settings.other.orientations.PORTRAIT_DOWN",
  [ScreenOrientation.OrientationLock.LANDSCAPE]:
    "home.settings.other.orientations.LANDSCAPE",
  [ScreenOrientation.OrientationLock.LANDSCAPE_LEFT]:
    "home.settings.other.orientations.LANDSCAPE_LEFT",
  [ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT]:
    "home.settings.other.orientations.LANDSCAPE_RIGHT",
  [ScreenOrientation.OrientationLock.OTHER]:
    "home.settings.other.orientations.OTHER",
  [ScreenOrientation.OrientationLock.UNKNOWN]:
    "home.settings.other.orientations.UNKNOWN",
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

export enum DownloadMethod {
  Remux = "remux",
  Optimized = "optimized",
}

export type Home = {
  sections: Array<HomeSection>;
};

export type HomeSection = {
  orientation?: "horizontal" | "vertical";
  items?: HomeSectionItemResolver;
  nextUp?: HomeSectionNextUpResolver;
};

export type HomeSectionItemResolver = {
  title?: string;
  sortBy?: Array<ItemSortBy>;
  sortOrder?: Array<SortOrder>;
  includeItemTypes?: Array<BaseItemKind>;
  genres?: Array<string>;
  parentId?: string;
  limit?: number;
  filters?: Array<ItemFilter>;
};

export type HomeSectionNextUpResolver = {
  parentId?: string;
  limit?: number;
  enableResumable?: boolean;
  enableRewatching?: boolean;
};

export enum VideoPlayer {
  // NATIVE, //todo: changes will make this a lot more easier to implement if we want. delete if not wanted
  VLC_3,
  VLC_4,
}

export type Settings = {
  home?: Home | null;
  followDeviceOrientation?: boolean;
  forceLandscapeInVideoPlayer?: boolean;
  deviceProfile?: "Expo" | "Native" | "Old";
  mediaListCollectionIds?: string[];
  preferedLanguage?: string;
  searchEngine: "Marlin" | "Jellyfin";
  marlinServerUrl?: string;
  openInVLC?: boolean;
  downloadQuality?: DownloadOption;
  defaultBitrate?: Bitrate;
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
  downloadMethod: DownloadMethod;
  autoDownload: boolean;
  showCustomMenuLinks: boolean;
  disableHapticFeedback: boolean;
  subtitleSize: number;
  remuxConcurrentLimit: 1 | 2 | 3 | 4;
  safeAreaInControlsEnabled: boolean;
  jellyseerrServerUrl?: string;
  hiddenLibraries?: string[];
  enableH265ForChromecast: boolean;
  defaultPlayer: VideoPlayer;
};

export interface Lockable<T> {
  locked: boolean;
  value: T;
}

export type PluginLockableSettings = {
  [K in keyof Settings]: Lockable<Settings[K]>;
};
export type StreamyfinPluginConfig = {
  settings: PluginLockableSettings;
};

const defaultValues: Settings = {
  home: null,
  followDeviceOrientation: true,
  forceLandscapeInVideoPlayer: false,
  deviceProfile: "Expo",
  mediaListCollectionIds: [],
  preferedLanguage: undefined,
  searchEngine: "Jellyfin",
  marlinServerUrl: "",
  openInVLC: false,
  downloadQuality: DownloadOptions[0],
  defaultBitrate: BITRATES[0],
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
  downloadMethod: DownloadMethod.Remux,
  autoDownload: false,
  showCustomMenuLinks: false,
  disableHapticFeedback: false,
  subtitleSize: Platform.OS === "ios" ? 60 : 100,
  remuxConcurrentLimit: 1,
  safeAreaInControlsEnabled: true,
  jellyseerrServerUrl: undefined,
  hiddenLibraries: [],
  enableH265ForChromecast: false,
  defaultPlayer: VideoPlayer.VLC_3, // ios only setting. does not matter what this is for android
};

const loadSettings = (): Partial<Settings> => {
  try {
    const jsonValue = storage.getString("settings");
    const loadedValues: Partial<Settings> =
      jsonValue != null ? JSON.parse(jsonValue) : {};

    return loadedValues;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return defaultValues;
  }
};

const EXCLUDE_FROM_SAVE = ["home"];

const saveSettings = (settings: Settings) => {
  Object.keys(settings).forEach((key) => {
    if (EXCLUDE_FROM_SAVE.includes(key)) {
      delete settings[key as keyof Settings];
    }
  });
  const jsonValue = JSON.stringify(settings);
  storage.set("settings", jsonValue);
};

export const settingsAtom = atom<Partial<Settings> | null>(null);
export const pluginSettingsAtom = atom(
  storage.get<PluginLockableSettings>(STREAMYFIN_PLUGIN_SETTINGS),
);

export const useSettings = () => {
  const [api] = useAtom(apiAtom);
  const [_settings, setSettings] = useAtom(settingsAtom);
  const [pluginSettings, _setPluginSettings] = useAtom(pluginSettingsAtom);

  useEffect(() => {
    if (_settings === null) {
      const loadedSettings = loadSettings();
      setSettings(loadedSettings);
    }
  }, [_settings, setSettings]);

  const setPluginSettings = useCallback(
    (settings: PluginLockableSettings | undefined) => {
      storage.setAny(STREAMYFIN_PLUGIN_SETTINGS, settings);
      _setPluginSettings(settings);
    },
    [_setPluginSettings],
  );

  const refreshStreamyfinPluginSettings = useCallback(async () => {
    if (!api) return;
    const settings = await api.getStreamyfinPluginConfig().then(
      ({ data }) => {
        writeInfoLog(`Got remote settings: ${data?.settings}`);
        return data?.settings;
      },
      (err) => undefined,
    );
    setPluginSettings(settings);
    return settings;
  }, [api]);

  const updateSettings = (update: Partial<Settings>) => {
    if (!_settings) return;
    const hasChanges = Object.entries(update).some(
      ([key, value]) => _settings[key as keyof Settings] !== value,
    );

    if (hasChanges) {
      // Merge default settings, current settings, and updates to ensure all required properties exist
      const newSettings = {
        ...defaultValues,
        ..._settings,
        ...update,
      } as Settings;
      setSettings(newSettings);
      saveSettings(newSettings);
    }
  };

  // We do not want to save over users pre-existing settings in case admin ever removes/unlocks a setting.
  // If admin sets locked to false but provides a value,
  // use user settings first and fallback on admin setting if required.
  const settings: Settings = useMemo(() => {
    let unlockedPluginDefaults = {} as Settings;
    const overrideSettings = Object.entries(pluginSettings || {}).reduce(
      (acc, [key, setting]) => {
        if (setting) {
          const { value, locked } = setting;

          // Make sure we override default settings with plugin settings when they are not locked.
          //  Admin decided what users defaults should be and grants them the ability to change them too.
          if (
            locked === false &&
            value &&
            _settings?.[key as keyof Settings] !== value
          ) {
            unlockedPluginDefaults = Object.assign(unlockedPluginDefaults, {
              [key as keyof Settings]: value,
            });
          }

          acc = Object.assign(acc, {
            [key]: locked
              ? value
              : (_settings?.[key as keyof Settings] ?? value),
          });
        }
        return acc;
      },
      {} as Settings,
    );

    return {
      ...defaultValues,
      ..._settings,
      ...overrideSettings,
    };
  }, [_settings, pluginSettings]);

  return [
    settings,
    updateSettings,
    pluginSettings,
    setPluginSettings,
    refreshStreamyfinPluginSettings,
  ] as const;
};
