import {
  type BaseItemKind,
  type CultureDto,
  type ItemFilter,
  type ItemSortBy,
  type SortOrder,
  SubtitlePlaybackMode,
} from "@jellyfin/sdk/lib/generated-client";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { BITRATES, type Bitrate } from "@/components/BitrateSelector";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom } from "@/providers/JellyfinProvider";
import { writeInfoLog } from "@/utils/log";
import { storage } from "../mmkv";

const _STREAMYFIN_PLUGIN_ID = "1e9e5d386e6746158719e98a5c34f004";
const STREAMYFIN_PLUGIN_SETTINGS = "STREAMYFIN_PLUGIN_SETTINGS";

export type DownloadQuality = "original" | "high" | "low";

export type DownloadOption = {
  label: string;
  value: DownloadQuality;
};

export const ScreenOrientationEnum: Record<
  (typeof ScreenOrientation.OrientationLock)[keyof typeof ScreenOrientation.OrientationLock],
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

export type Home = {
  sections: Array<HomeSection>;
};

export type HomeSection = {
  title?: string;
  orientation?: "horizontal" | "vertical";
  items?: HomeSectionItemResolver;
  nextUp?: HomeSectionNextUpResolver;
  latest?: HomeSectionLatestResolver;
  custom?: HomeSectionCustomEndpointResolver;
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

export type HomeSectionCustomEndpointResolver = {
  title?: string;
  endpoint: string;
  headers?: any;
  query?: any;
};

export type HomeSectionNextUpResolver = {
  parentId?: string;
  limit?: number;
  enableResumable?: boolean;
  enableRewatching?: boolean;
};

export interface MaxAutoPlayEpisodeCount {
  key: string;
  value: number;
}

export type HomeSectionLatestResolver = {
  parentId?: string;
  limit?: number;
  groupItems?: boolean;
  isPlayed?: boolean;
  includeItemTypes?: Array<BaseItemKind>;
};

// Video player enum - currently only MPV is supported
export enum VideoPlayer {
  MPV = 0,
}

// Audio transcoding mode - controls how surround audio is handled
// This controls server-side transcoding behavior for audio streams.
// MPV decodes via FFmpeg and supports most formats, but mobile devices
// can't passthrough to external receivers, so this primarily affects
// bandwidth usage and server load.
export enum AudioTranscodeMode {
  Auto = "auto", // Platform defaults (recommended)
  ForceStereo = "stereo", // Always transcode to stereo
  Allow51 = "5.1", // Allow up to 5.1, transcode 7.1+
  AllowAll = "passthrough", // Direct play all audio formats
}

export type Settings = {
  home?: Home | null;
  deviceProfile?: "Expo" | "Native" | "Old";
  mediaListCollectionIds?: string[];
  preferedLanguage?: string;
  searchEngine: "Marlin" | "Jellyfin" | "Streamystats";
  marlinServerUrl?: string;
  streamyStatsServerUrl?: string;
  streamyStatsMovieRecommendations?: boolean;
  streamyStatsSeriesRecommendations?: boolean;
  streamyStatsPromotedWatchlists?: boolean;
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
  defaultVideoOrientation: (typeof ScreenOrientation.OrientationLock)[keyof typeof ScreenOrientation.OrientationLock];
  forwardSkipTime: number;
  rewindSkipTime: number;
  showCustomMenuLinks: boolean;
  disableHapticFeedback: boolean;
  subtitleSize: number;
  safeAreaInControlsEnabled: boolean;
  jellyseerrServerUrl?: string;
  useKefinTweaks: boolean;
  hiddenLibraries?: string[];
  enableH265ForChromecast: boolean;
  maxAutoPlayEpisodeCount: MaxAutoPlayEpisodeCount;
  autoPlayEpisodeCount: number;
  // Playback speed settings
  defaultPlaybackSpeed: number;
  playbackSpeedPerMedia: Record<string, number>;
  playbackSpeedPerShow: Record<string, number>;
  // MPV subtitle settings
  mpvSubtitleScale?: number;
  mpvSubtitleMarginY?: number;
  mpvSubtitleAlignX?: "left" | "center" | "right";
  mpvSubtitleAlignY?: "top" | "center" | "bottom";
  mpvSubtitleFontSize?: number;
  // Gesture controls
  enableHorizontalSwipeSkip: boolean;
  enableLeftSideBrightnessSwipe: boolean;
  enableRightSideVolumeSwipe: boolean;
  hideVolumeSlider: boolean;
  hideBrightnessSlider: boolean;
  usePopularPlugin: boolean;
  showLargeHomeCarousel: boolean;
  mergeNextUpAndContinueWatching: boolean;
  // Appearance
  hideRemoteSessionButton: boolean;
  hideWatchlistsTab: boolean;
  // Audio look-ahead caching
  audioLookaheadEnabled: boolean;
  audioLookaheadCount: number;
  audioMaxCacheSizeMB: number;
  // Music playback
  preferLocalAudio: boolean;
  // Audio transcoding mode
  audioTranscodeMode: AudioTranscodeMode;
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

export const defaultValues: Settings = {
  home: null,
  deviceProfile: "Expo",
  mediaListCollectionIds: [],
  preferedLanguage: undefined,
  searchEngine: "Jellyfin",
  marlinServerUrl: "",
  streamyStatsServerUrl: "",
  streamyStatsMovieRecommendations: false,
  streamyStatsSeriesRecommendations: false,
  streamyStatsPromotedWatchlists: false,
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
  showCustomMenuLinks: false,
  disableHapticFeedback: false,
  subtitleSize: 100, // Scale value * 100, so 100 = 1.0x
  safeAreaInControlsEnabled: true,
  jellyseerrServerUrl: undefined,
  useKefinTweaks: false,
  hiddenLibraries: [],
  enableH265ForChromecast: false,
  maxAutoPlayEpisodeCount: { key: "3", value: 3 },
  autoPlayEpisodeCount: 0,
  // Playback speed defaults
  defaultPlaybackSpeed: 1.0,
  playbackSpeedPerMedia: {},
  playbackSpeedPerShow: {},
  // MPV subtitle defaults
  mpvSubtitleScale: undefined,
  mpvSubtitleMarginY: undefined,
  mpvSubtitleAlignX: undefined,
  mpvSubtitleAlignY: undefined,
  mpvSubtitleFontSize: undefined,
  // Gesture controls
  enableHorizontalSwipeSkip: true,
  enableLeftSideBrightnessSwipe: true,
  enableRightSideVolumeSwipe: true,
  hideVolumeSlider: false,
  hideBrightnessSlider: false,
  usePopularPlugin: true,
  showLargeHomeCarousel: false,
  mergeNextUpAndContinueWatching: false,
  // Appearance
  hideRemoteSessionButton: false,
  hideWatchlistsTab: false,
  // Audio look-ahead caching defaults
  audioLookaheadEnabled: true,
  audioLookaheadCount: 1,
  audioMaxCacheSizeMB: 500,
  // Music playback
  preferLocalAudio: true,
  // Audio transcoding mode
  audioTranscodeMode: AudioTranscodeMode.Auto,
};

const loadSettings = (): Partial<Settings> => {
  try {
    const jsonValue = storage.getString("settings");
    const loadedValues: Partial<Settings> =
      jsonValue != null ? JSON.parse(jsonValue) : {};

    return loadedValues;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return {};
  }
};

const EXCLUDE_FROM_SAVE = ["home"];

const saveSettings = (settings: Settings) => {
  try {
    for (const key of Object.keys(settings)) {
      if (EXCLUDE_FROM_SAVE.includes(key)) {
        delete settings[key as keyof Settings];
      }
    }
    const jsonValue = JSON.stringify(settings);
    storage.set("settings", jsonValue);
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
};

export const settingsAtom = atom<Partial<Settings> | null>(null);
const loadPluginSettings = () => {
  try {
    return storage.get<PluginLockableSettings>(STREAMYFIN_PLUGIN_SETTINGS);
  } catch (error) {
    console.error("Failed to load plugin settings:", error);
    return undefined;
  }
};

export const pluginSettingsAtom = atom<PluginLockableSettings | undefined>(
  loadPluginSettings(),
);

export const useSettings = () => {
  const api = useAtomValue(apiAtom);
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

  const refreshStreamyfinPluginSettings = useCallback(
    async (forceOverride = false) => {
      if (!api) {
        return;
      }
      const newPluginSettings = await api.getStreamyfinPluginConfig().then(
        ({ data }) => {
          writeInfoLog("Got plugin settings", data?.settings);
          return data?.settings;
        },
        (_err) => undefined,
      );
      setPluginSettings(newPluginSettings);

      // Apply plugin values to settings
      if (newPluginSettings && _settings) {
        const updates: Partial<Settings> = {};
        for (const [key, setting] of Object.entries(newPluginSettings)) {
          if (setting && !setting.locked && setting.value !== undefined) {
            const settingsKey = key as keyof Settings;
            // Apply if forceOverride is true, or if user hasn't explicitly set this value
            if (
              forceOverride ||
              _settings[settingsKey] === undefined ||
              _settings[settingsKey] === ""
            ) {
              (updates as any)[settingsKey] = setting.value;
            }
          }
        }

        // Auto-enable Streamystats if server URL is provided
        const streamyStatsUrl = newPluginSettings.streamyStatsServerUrl;
        if (
          streamyStatsUrl?.value &&
          _settings.searchEngine !== "Streamystats"
        ) {
          updates.searchEngine = "Streamystats";
        }
        if (Object.keys(updates).length > 0) {
          const newSettings = {
            ...defaultValues,
            ..._settings,
            ...updates,
          } as Settings;
          setSettings(newSettings);
          saveSettings(newSettings);
        }
      }

      return newPluginSettings;
    },
    [api, _settings],
  );

  const updateSettings = (update: Partial<Settings>) => {
    if (!_settings) {
      return;
    }
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
    const unlockedPluginDefaults: Partial<Settings> = {};
    const overrideSettings = Object.entries(pluginSettings ?? {}).reduce<
      Partial<Settings>
    >((acc, [key, setting]) => {
      if (setting) {
        const { value, locked } = setting;
        const settingsKey = key as keyof Settings;

        // Make sure we override default settings with plugin settings when they are not locked.
        if (
          !locked &&
          value !== undefined &&
          _settings?.[settingsKey] !== value
        ) {
          (unlockedPluginDefaults as any)[settingsKey] = value;
        }

        (acc as any)[settingsKey] = locked
          ? value
          : (_settings?.[settingsKey] ?? value);
      }
      return acc;
    }, {});

    return {
      ...defaultValues,
      ..._settings,
      ...overrideSettings,
    };
  }, [_settings, pluginSettings]);

  return {
    settings,
    updateSettings,
    pluginSettings,
    setPluginSettings,
    refreshStreamyfinPluginSettings,
  };
};
