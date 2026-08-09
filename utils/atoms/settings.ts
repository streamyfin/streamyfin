import {
  type BaseItemKind,
  type CultureDto,
  type ItemFilter,
  type ItemSortBy,
  type SortOrder,
  SubtitlePlaybackMode,
} from "@jellyfin/sdk/lib/generated-client";
import { t } from "i18next";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { Platform } from "react-native";
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

/**
 * The plugin may send object-typed settings as plain primitives.
 * Resolve to the proper option object from the available choices.
 */
const normalizePluginValue = (
  settingsKey: keyof Settings,
  value: unknown,
): unknown => {
  if (typeof value !== "object" || value === null) {
    const defaultVal = defaultValues[settingsKey];
    if (
      typeof defaultVal === "object" &&
      defaultVal !== null &&
      "key" in defaultVal &&
      "value" in defaultVal
    ) {
      // defaultBitrate needs a lookup because its keys are human-readable
      // (e.g. "8 Mb/s") that can't be derived from the raw value (e.g. 8000000).
      // Other { key, value } settings like maxAutoPlayEpisodeCount work with
      // the fallback because their keys are just String(value) (e.g. "5").
      if (settingsKey === "defaultBitrate") {
        const match = BITRATES.find(
          (b) => b.key === value || b.value === value,
        );
        if (match) return match;
      }
      // maxAutoPlayEpisodeCount: 0 is invalid (breaks autoplay), clamp to -1
      // -1 key must match the translated dropdown label so the UI shows "Disabled"
      if (
        settingsKey === "maxAutoPlayEpisodeCount" &&
        (value === 0 || value === -1)
      ) {
        return { key: t("home.settings.other.disabled"), value: -1 };
      }
      return { key: String(value), value };
    }
  }
  return value;
};

export type HomeSectionLatestResolver = {
  parentId?: string;
  limit?: number;
  groupItems?: boolean;
  isPlayed?: boolean;
  includeItemTypes?: Array<BaseItemKind>;
};

// Video player enum. MPV is the universal default; ExoPlayer is an
// opt-in alternative on Android TV, selectable via settings.videoPlayer.
// Native is the fully-native iOS player (iPhone only).
export enum VideoPlayer {
  MPV = 0,
  ExoPlayer = 1,
  Native = 2,
}

/**
 * Whether ExoPlayer's native module is available on the current platform.
 * ExoPlayer only ships for Android TV; on any other platform a persisted
 * `videoPlayer: ExoPlayer` preference (e.g. MMKV roaming) must fall back
 * to MPV rather than crash on requireNativeView().
 */
export const isExoPlayerSupported =
  Platform.OS === "android" && Platform.isTV === true;

/**
 * Whether the fully-native iOS player is available on the current platform.
 * It only ships for iPhone/iPad (not TV); a persisted `videoPlayer: Native`
 * preference roaming to another platform must fall back to MPV.
 */
export const isNativePlayerSupported =
  Platform.OS === "ios" && Platform.isTV !== true;

/**
 * Resolve the actually-active video player for the current settings.
 * MPV is the default on Android and TV; users can opt into ExoPlayer on
 * Android TV via settings.videoPlayer. On iPhone/iPad the fully-native
 * player is the default: an unset `videoPlayer` (user never chose) or an
 * explicit `Native` selection resolves to Native, while an explicit MPV
 * choice is the opt-out and wins. The platform capability gates are
 * folded in here so callers (VideoPlayerView, direct-player's device
 * profile, PlaySettingsProvider) can never advertise a player on a
 * platform where another one is actually rendering — that mismatch would
 * let Jellyfin pick a stream for the wrong renderer.
 */
export const getActiveVideoPlayer = (
  settings: Pick<Settings, "videoPlayer"> | null | undefined,
): VideoPlayer => {
  if (isExoPlayerSupported && settings?.videoPlayer === VideoPlayer.ExoPlayer) {
    return VideoPlayer.ExoPlayer;
  }
  if (
    isNativePlayerSupported &&
    (settings?.videoPlayer === undefined ||
      settings?.videoPlayer === VideoPlayer.Native)
  ) {
    return VideoPlayer.Native;
  }
  return VideoPlayer.MPV;
};

/**
 * Same selection as getActiveVideoPlayer but returns the lowercase
 * player-type identifier that `generateDeviceProfile` expects.
 */
export const getActivePlayerType = (
  settings: Pick<Settings, "videoPlayer"> | null | undefined,
): "mpv" | "exoplayer" => {
  // The Native player intentionally advertises the mpv device profile
  // (it uses the MPV engine).
  return getActiveVideoPlayer(settings) === VideoPlayer.ExoPlayer
    ? "exoplayer"
    : "mpv";
};

// TV Typography scale presets
export enum TVTypographyScale {
  Small = "small",
  Default = "default",
  Large = "large",
  ExtraLarge = "extraLarge",
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

// Inactivity timeout for TV - auto logout after period of no activity
export enum InactivityTimeout {
  Disabled = 0,
  OneMinute = 60000,
  FiveMinutes = 300000,
  FifteenMinutes = 900000,
  ThirtyMinutes = 1800000,
  OneHour = 3600000,
  FourHours = 14400000,
  TwentyFourHours = 86400000,
}

// MPV cache mode - controls how caching is enabled
export type MpvCacheMode = "auto" | "yes" | "no";
export type MpvVoDriver = "gpu-next" | "gpu";

export type Settings = {
  home?: Home | null;
  deviceProfile?: "Expo" | "Native" | "Old";
  mediaListCollectionIds?: string[];
  preferedLanguage?: string;
  searchEngine: "Marlin" | "Jellyfin" | "Streamystats";
  /** Video player backend. Defaults to MPV when unset (see getActiveVideoPlayer). */
  videoPlayer?: VideoPlayer;
  marlinServerUrl?: string;
  streamyStatsServerUrl?: string;
  streamyStatsMovieRecommendations?: boolean;
  streamyStatsSeriesRecommendations?: boolean;
  streamyStatsPromotedWatchlists?: boolean;
  downloadQuality?: DownloadOption;
  /** iOS only: show a Lock Screen / Dynamic Island Live Activity while a download runs. */
  showDownloadLiveActivity: boolean;
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
  autoPlayNextEpisode: boolean;
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
  mpvSubtitleBackgroundEnabled?: boolean;
  mpvSubtitleBackgroundOpacity?: number; // 0-100
  // MPV buffer/cache settings
  mpvCacheEnabled?: MpvCacheMode;
  mpvCacheSeconds?: number;
  mpvDemuxerMaxBytes?: number; // MB
  mpvDemuxerMaxBackBytes?: number; // MB
  // MPV video output driver (Android only)
  mpvVoDriver?: MpvVoDriver;
  // Gesture controls
  enableHorizontalSwipeSkip: boolean;
  enableLeftSideBrightnessSwipe: boolean;
  enableRightSideVolumeSwipe: boolean;
  enableHoldToSpeed: boolean;
  enablePinchToZoom: boolean;
  hideVolumeSlider: boolean;
  hideBrightnessSlider: boolean;
  usePopularPlugin: boolean;
  mergeNextUpAndContinueWatching: boolean;
  // Use the episode's own image (instead of the series thumb) for the
  // "Next Up" and "Continue Watching" home rows.
  useEpisodeImagesForNextUp: boolean;
  // TV-specific settings
  showHomeBackdrop: boolean;
  showTVHeroCarousel: boolean;
  tvTypographyScale: TVTypographyScale;
  showSeriesPosterOnEpisode: boolean;
  tvThemeMusicEnabled: boolean;
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
  // OpenSubtitles API key for client-side subtitle fetching
  openSubtitlesApiKey?: string;
  // TV-only: Inactivity timeout for auto-logout
  inactivityTimeout: InactivityTimeout;
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
  // videoPlayer intentionally undefined — resolved at runtime via
  // getActiveVideoPlayer() so existing installs are unaffected.
  marlinServerUrl: "",
  streamyStatsServerUrl: "",
  streamyStatsMovieRecommendations: false,
  streamyStatsSeriesRecommendations: false,
  streamyStatsPromotedWatchlists: false,
  downloadQuality: DownloadOptions[0],
  showDownloadLiveActivity: true,
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
  autoPlayNextEpisode: true,
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
  mpvSubtitleBackgroundEnabled: false,
  mpvSubtitleBackgroundOpacity: 75,
  // MPV buffer/cache defaults.
  // Android TV gets tighter caps — combined with libmpv 1.0's larger
  // baseline (fontconfig + libxml2 + libplacebo HDR path + scudo
  // retention) the larger mobile budget pushes 2 GB Android TV boxes
  // into swap death during 4K HDR playback. Apple TV has more RAM and
  // keeps the full budget. Users can override via the settings screen.
  mpvCacheEnabled: "auto",
  mpvCacheSeconds: 10,
  mpvDemuxerMaxBytes: Platform.isTV && Platform.OS === "android" ? 75 : 150, // MB
  mpvDemuxerMaxBackBytes: Platform.isTV && Platform.OS === "android" ? 30 : 50, // MB
  // MPV video output driver defaults (Android only)
  mpvVoDriver: "gpu-next",
  // Gesture controls
  enableHorizontalSwipeSkip: true,
  enableLeftSideBrightnessSwipe: true,
  enableRightSideVolumeSwipe: true,
  enableHoldToSpeed: true,
  enablePinchToZoom: true,
  hideVolumeSlider: false,
  hideBrightnessSlider: false,
  usePopularPlugin: true,
  mergeNextUpAndContinueWatching: false,
  useEpisodeImagesForNextUp: false,
  // TV-specific settings
  showHomeBackdrop: true,
  showTVHeroCarousel: true,
  tvTypographyScale: TVTypographyScale.Default,
  showSeriesPosterOnEpisode: false,
  tvThemeMusicEnabled: true,
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
  // TV-only: Inactivity timeout (disabled by default)
  inactivityTimeout: InactivityTimeout.Disabled,
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

const hasMeaningfulSettingValue = (value: unknown) =>
  value !== undefined && value !== null && value !== "";

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

  const refreshStreamyfinPluginSettings = useCallback(async () => {
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

    // Locked/unlocked values are handled by the settings memo, which
    // applies locked values at runtime without overwriting user storage.
    // We only handle auto-enabling Streamystats here.
    if (newPluginSettings && _settings) {
      const streamyStatsUrl = newPluginSettings.streamyStatsServerUrl;
      if (streamyStatsUrl?.value && _settings.searchEngine !== "Streamystats") {
        const newSettings = {
          ...defaultValues,
          ..._settings,
          searchEngine: "Streamystats",
        } as Settings;
        setSettings(newSettings);
        saveSettings(newSettings);
      }
    }

    return newPluginSettings;
  }, [api, _settings]);

  const updateSettings = (update: Partial<Settings>) => {
    if (!_settings) {
      return;
    }
    // Admin-locked settings are enforced at write time too: a control that
    // isn't disabled in the UI must not persist a value the admin pinned.
    // The read memo already overrides locked keys, but without this guard the
    // write would silently land in user storage and resurface once unlocked.
    const sanitizedUpdate = Object.fromEntries(
      Object.entries(update).filter(
        ([key]) => pluginSettings?.[key as keyof Settings]?.locked !== true,
      ),
    ) as Partial<Settings>;

    const hasChanges = Object.entries(sanitizedUpdate).some(
      ([key, value]) => _settings[key as keyof Settings] !== value,
    );

    if (hasChanges) {
      // Merge default settings, current settings, and updates to ensure all required properties exist
      const newSettings = {
        ...defaultValues,
        ..._settings,
        ...sanitizedUpdate,
      } as Settings;
      setSettings(newSettings);
      saveSettings(newSettings);
    }
  };

  // We do not want to save over users pre-existing settings in case admin ever removes/unlocks a setting.
  // If admin sets locked to false but provides a value,
  // use persisted settings first, then app defaults, and only fallback on the
  // plugin value when neither provides a meaningful value.
  const settings: Settings = useMemo(() => {
    const overrideSettings = Object.entries(pluginSettings ?? {}).reduce<
      Partial<Settings>
    >((acc, [key, setting]) => {
      if (setting) {
        let { value } = setting;
        const { locked } = setting;
        const settingsKey = key as keyof Settings;

        // Normalize object-typed settings from plugin (plain primitive → { key, value })
        value = normalizePluginValue(settingsKey, value);

        // When unlocked, keep the user's value only if they explicitly diverged
        // from the app default. Otherwise the plugin value is the admin's
        // default and must win over the hardcoded app default — e.g. a toggle
        // that was always locked then unlocked should reflect the plugin
        // default, not the app's `false`. Object-typed settings compare by
        // reference, so their behaviour is unchanged.
        const userValue = _settings?.[settingsKey];
        const userDiverged =
          hasMeaningfulSettingValue(userValue) &&
          userValue !== defaultValues[settingsKey];

        (acc as any)[settingsKey] = locked
          ? value
          : userDiverged
            ? userValue
            : hasMeaningfulSettingValue(value)
              ? value
              : defaultValues[settingsKey];
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
