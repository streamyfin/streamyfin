import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import * as ScreenOrientation from "expo-screen-orientation";
import { storage } from "../mmkv";
import { Platform } from "react-native";
import {
  CultureDto,
  PluginStatus,
  SubtitlePlaybackMode,
  ItemSortBy,
  SortOrder,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPluginsApi } from "@jellyfin/sdk/lib/utils/api";
import { writeErrorLog } from "@/utils/log";

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

export enum DownloadMethod {
  Remux = "remux",
  Optimized = "optimized",
}

export type Home = {
  sections: Map<string, HomeSection>;
};

export type HomeSection = {
  orientation?: "horizontal" | "vertical";
  // type?: HomeSectionType;
  items?: HomeSectionItemResolver;
};

export type HomeSectionItemResolver = {
  sortBy?: Array<ItemSortBy>;
  sortOrder?: Array<SortOrder>;
  includeItemTypes?: Array<BaseItemKind>;
  genres?: Array<string>;
  parentId?: string;
  limit?: number;
};

export enum HomeSectionType {
  row,
  carousel,
}

export type Settings = {
  home?: Home | null;
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

const HomeExample: Home = {
  sections: new Map([
    [
      "example Section",
      {
        orientation: "vertical",
        type: HomeSectionType.row,
        items: {
          sortBy: ItemSortBy.Name,
          includeItemTypes: [BaseItemKind.Movie],
        },
      },
    ],
  ]),
};

const loadSettings = (): Settings => {
  const defaultValues: Settings = {
    /**
     * Loads the application settings from persistent storage.
     * If no settings are found or loading fails, returns a set of default settings.
     *
     * @returns {Settings} The loaded settings merged with default values.
     *
     * The default settings include:
     * - `home`: Example configuration for home sections.
     * - `autoRotate`: Enables auto-rotation of the interface.
     * - `forceLandscapeInVideoPlayer`: Forces landscape orientation in the video player.
     * - `usePopularPlugin`: Indicates whether a popular plugin is used.
     * - `deviceProfile`: The profile of the device, such as "Expo".
     * - `mediaListCollectionIds`: An empty array for media list collection IDs.
     * - `searchEngine`: The search engine to use, defaulting to "Jellyfin".
     * - `marlinServerUrl`: The URL for the Marlin server, if any.
     * - `openInVLC`: Determines if media should open in VLC by default.
     * - `downloadQuality`: The default download quality setting.
     * - `libraryOptions`: Options for displaying the library.
     * - `defaultAudioLanguage`: The default audio language, if any.
     * - `playDefaultAudioTrack`: Whether to play the default audio track.
     * - `rememberAudioSelections`: Whether to remember audio selections.
     * - `defaultSubtitleLanguage`: The default subtitle language, if any.
     * - `subtitleMode`: The mode for subtitle playback.
     * - `rememberSubtitleSelections`: Whether to remember subtitle selections.
     * - `showHomeTitles`: Controls the display of home section titles.
     * - `defaultVideoOrientation`: The default video orientation setting.
     * - `forwardSkipTime`: The time in seconds to skip forward.
     * - `rewindSkipTime`: The time in seconds to skip backward.
     * - `optimizedVersionsServerUrl`: URL for optimized versions server, if any.
     * - `downloadMethod`: The default download method, such as "Remux".
     * - `autoDownload`: Whether to enable automatic downloading.
     * - `showCustomMenuLinks`: Whether to show custom menu links.
     * - `disableHapticFeedback`: Whether to disable haptic feedback.
     * - `subtitleSize`: The size of subtitles, varying by platform.
     * - `remuxConcurrentLimit`: Limit for concurrent remux processes.
     * - `safeAreaInControlsEnabled`: Whether safe area in controls is enabled.
     * - `jellyseerrServerUrl`: URL for the Jellyseerr server, if any.
     * - `hiddenLibraries`: An array of hidden library IDs.
     */

    home: HomeExample,
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
export const pluginSettingsAtom = atom(
  storage.get<PluginLockableSettings>(STREAMYFIN_PLUGIN_SETTINGS)
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
    [_setPluginSettings]
  );

  const refreshStreamyfinPluginSettings = useCallback(async () => {
    if (!api) return;

    const plugins = await getPluginsApi(api)
      .getPlugins()
      .then(({ data }) => data);

    if (plugins && plugins.length > 0) {
      const streamyfinPlugin = plugins.find(
        (plugin) => plugin.Id === STREAMYFIN_PLUGIN_ID
      );

      if (!streamyfinPlugin || streamyfinPlugin.Status != PluginStatus.Active) {
        writeErrorLog(
          "Streamyfin plugin is currently not active.\n" +
            `Current status is: ${streamyfinPlugin?.Status}`
        );
        setPluginSettings(undefined);
        return;
      }

      const settings = await api
        .getStreamyfinPluginConfig()
        .then(({ data }) => data.settings);

      setPluginSettings(settings);
      return settings;
    }
  }, [api]);

  // We do not want to save over users pre-existing settings in case admin ever removes/unlocks a setting.
  // If admin sets locked to false but provides a value,
  //  use user settings first and fallback on admin setting if required.
  const settings: Settings = useMemo(() => {
    const overrideSettings = Object.entries(pluginSettings || {}).reduce(
      (acc, [key, setting]) => {
        if (setting) {
          const { value, locked } = setting;
          acc = Object.assign(acc, {
            [key]: locked ? value : _settings?.[key as keyof Settings] ?? value,
          });
        }
        return acc;
      },
      {} as Settings
    );

    return {
      ..._settings,
      ...overrideSettings,
    };
  }, [
    _settings,
    setSettings,
    pluginSettings,
    _setPluginSettings,
    setPluginSettings,
  ]);

  const updateSettings = (update: Partial<Settings>) => {
    if (settings) {
      const newSettings = { ...settings, ...update };

      setSettings(newSettings);
      saveSettings(newSettings);
    }
  };

  return [
    settings,
    updateSettings,
    pluginSettings,
    setPluginSettings,
    refreshStreamyfinPluginSettings,
  ] as const;
};
