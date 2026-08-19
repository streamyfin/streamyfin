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
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { BITRATES, type Bitrate } from "@/components/BitrateSelector";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom } from "@/providers/JellyfinProvider";
import { logAndCaptureError, writeInfoLog } from "@/utils/log";
import {
  PLUGIN_SETTINGS_KEY,
  readStoredSettings,
  SETTINGS_KEY,
} from "@/utils/storedSettings";
import { storage } from "../mmkv";
import {
  type AppliedPluginDefaults,
  pendingPluginDefaults,
  resolveEffectiveSettings,
} from "./settingsOverrides";

const _STREAMYFIN_PLUGIN_ID = "1e9e5d386e6746158719e98a5c34f004";
const STREAMYFIN_PLUGIN_SETTINGS = PLUGIN_SETTINGS_KEY;

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
// Native is the fully-native player (iOS and Android phone/tablet).
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
 * Whether the fully-native player is available on the current platform.
 * It ships for iPhone/iPad and Android mobile/tablet (not TV); on iOS it is
 * the default, on Android it is currently opt-in via settings.
 */
export const isNativePlayerSupported =
  (Platform.OS === "ios" || Platform.OS === "android") &&
  Platform.isTV !== true;

/**
 * Whether the fully-native player can run on the current platform as the
 * Apple TV variant. Like iPhone/iPad it is the default, with the
 * `nativeVideoPlayerTV` setting as the opt-out, and it requires tvOS 26+ —
 * the chrome is built on native glass Menus and other 26-era APIs, so older
 * boxes keep the JS player unconditionally.
 */
export const isNativePlayerSupportedTV =
  Platform.OS === "ios" &&
  Platform.isTV === true &&
  Number.parseInt(String(Platform.Version), 10) >= 26;

/**
 * Whether the fully-native player can run on the current platform as the
 * Android TV variant. It is opt-in via `nativeVideoPlayerAndroidTV` (default false),
 * and requires Android TV.
 */
export const isNativePlayerSupportedAndroidTV =
  Platform.OS === "android" && Boolean(Platform.isTV);

/**
 * Resolve the actually-active video player for the current settings.
 * MPV is the default on Android; users can opt into ExoPlayer on
 * Android TV or the Native player on Android mobile via settings.videoPlayer.
 * On Android TV, users can opt into the native player via `nativeVideoPlayerAndroidTV`.
 * On iPhone/iPad the fully-native player is the default: an unset `videoPlayer`
 * (user never chose) or an explicit `Native` selection resolves to Native,
 * while an explicit MPV choice is the opt-out and wins. On Apple TV (tvOS 26+)
 * the native player is likewise the default, with the separate
 * `nativeVideoPlayerTV` toggle as the opt-out. The platform capability gates are
 * folded in here so callers (VideoPlayerView, direct-player's device
 * profile, PlaySettingsProvider) can never advertise a player on a
 * platform where another one is actually rendering — that mismatch would
 * let Jellyfin pick a stream for the wrong renderer.
 */
export const getActiveVideoPlayer = (
  settings:
    | Partial<
        Pick<
          Settings,
          "videoPlayer" | "nativeVideoPlayerTV" | "nativeVideoPlayerAndroidTV"
        >
      >
    | null
    | undefined,
): VideoPlayer => {
  if (isExoPlayerSupported && settings?.videoPlayer === VideoPlayer.ExoPlayer) {
    return VideoPlayer.ExoPlayer;
  }
  if (isNativePlayerSupportedTV && settings?.nativeVideoPlayerTV !== false) {
    return VideoPlayer.Native;
  }
  if (
    isNativePlayerSupportedAndroidTV &&
    settings?.nativeVideoPlayerAndroidTV === true
  ) {
    return VideoPlayer.Native;
  }
  if (
    isNativePlayerSupported &&
    ((Platform.OS === "ios" && settings?.videoPlayer === undefined) ||
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
  settings:
    | Partial<
        Pick<
          Settings,
          "videoPlayer" | "nativeVideoPlayerTV" | "nativeVideoPlayerAndroidTV"
        >
      >
    | null
    | undefined,
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

export enum AppleTVTopShelfLayout {
  Sectioned = "sectioned",
  Inset = "inset",
  Carousel = "carousel",
}

export enum AppleTVTopShelfContent {
  ContinueAndNextUp = "continueAndNextUp",
  ContinueWatching = "continueWatching",
  NextUp = "nextUp",
  RecentlyAdded = "recentlyAdded",
  Recommendations = "recommendations",
}

export enum AppleTVTopShelfRecommendationsType {
  Movies = "Movie",
  Series = "Series",
  All = "all",
}

// MPV cache mode - controls how caching is enabled
export type MpvCacheMode = "auto" | "yes" | "no";
export type MpvVoDriver = "gpu-next" | "gpu";

/** Content groups that can appear in the home hero carousel. */
export type HomeHeroSection = "continueWatching" | "nextUp" | "recentlyAdded";
/** Media kinds that can appear in the home hero carousel. */
export type HomeHeroMediaType = "movie" | "tv";

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
  /** Native player: auto-enable a text subtitle while the volume is at zero. */
  subtitlesOnMute: boolean;
  showHomeTitles: boolean;
  defaultVideoOrientation: (typeof ScreenOrientation.OrientationLock)[keyof typeof ScreenOrientation.OrientationLock];
  forwardSkipTime: number;
  rewindSkipTime: number;
  showCustomMenuLinks: boolean;
  disableHapticFeedback: boolean;
  subtitleSize: number;
  safeAreaInControlsEnabled: boolean;
  jellyseerrServerUrl?: string;
  /** Seerr admin API key: signs the user in via their Jellyfin ID, no password. */
  jellyseerrApiKey?: string;
  /**
   * Sign in to Jellyseerr automatically on launch using the Jellyfin password.
   * Jellyseerr's /auth/jellyfin endpoint takes the password rather than the
   * Jellyfin token, so enabling this persists that password in the platform
   * secure store. Nothing is stored unless a Jellyseerr server is configured.
   */
  autoLoginJellyseerr: boolean;
  useKefinTweaks: boolean;
  hiddenLibraries?: string[];
  enableH265ForChromecast: boolean;
  maxAutoPlayEpisodeCount: MaxAutoPlayEpisodeCount;
  autoPlayEpisodeCount: number;
  autoPlayNextEpisode: boolean;
  /** Ask whether to resume or start over when playing an in-progress item. */
  showResumeDialog: boolean;
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
  holdToSpeedRate: number;
  enablePinchToZoom: boolean;
  enableDoubleTapToSeek: boolean;
  hideVolumeSlider: boolean;
  hideBrightnessSlider: boolean;
  usePopularPlugin: boolean;
  mergeNextUpAndContinueWatching: boolean;
  /**
   * Home hero carousel filters. Both are "hidden" lists, so an empty list
   * (the default) shows everything, and they combine: hiding the
   * "recentlyAdded" group and the "movie" media type leaves only
   * continue-watching and next-up episodes.
   */
  hiddenHomeHeroSections?: HomeHeroSection[];
  hiddenHomeHeroMediaTypes?: HomeHeroMediaType[];
  // Use the episode's own image (instead of the series thumb) for the
  // "Next Up" and "Continue Watching" home rows.
  useEpisodeImagesForNextUp: boolean;
  // TV-specific settings
  /** Apple TV only: use the fully-native tvOS player (default on; needs tvOS 26+). */
  nativeVideoPlayerTV: boolean;
  /** Android TV only: use the fully-native Android TV player (opt-in; default off). */
  nativeVideoPlayerAndroidTV?: boolean;
  /** Apple TV only: which native tvOS Top Shelf layout to publish. */
  appleTvTopShelfLayout: AppleTVTopShelfLayout;
  /** Apple TV only: which content preset to publish to Top Shelf. */
  appleTvTopShelfContent: AppleTVTopShelfContent;
  /** Apple TV only: which media type(s) to include when Top Shelf content is Recommendations. */
  appleTvTopShelfRecommendationsType: AppleTVTopShelfRecommendationsType;
  showHomeBackdrop: boolean;
  /**
   * The home hero carousel, on every platform — the TV one and the iOS one
   * are the same feature and share this single switch. Stored values from
   * the old TV-only `showTVHeroCarousel` key are migrated in `loadSettings`.
   */
  showHeroCarousel: boolean;
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
  // Optional third-party lookups. Both call a service directly from the client
  // rather than through Jellyfin, so each can be turned off on its own.
  wikidataAwardsEnabled: boolean;
  openSubtitlesEnabled: boolean;
  // OpenSubtitles API key for client-side subtitle fetching
  openSubtitlesApiKey?: string;
  // TV-only: Inactivity timeout for auto-logout
  inactivityTimeout: InactivityTimeout;
  /** Anonymous crash/error reporting via Sentry (on by default, opt-out). */
  sentryEnabled: boolean;
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

// Settings whose values are secrets. They must never reach the app log,
// which users read in-app and paste into bug reports.
const SENSITIVE_SETTING_KEYS: ReadonlySet<keyof Settings> = new Set([
  "jellyseerrApiKey",
  "openSubtitlesApiKey",
] as const);

export const redactPluginSettings = (
  settings: PluginLockableSettings | undefined,
): PluginLockableSettings | undefined =>
  settings &&
  (Object.fromEntries(
    Object.entries(settings).map(([key, lockable]) => [
      key,
      SENSITIVE_SETTING_KEYS.has(key as keyof Settings) && lockable?.value
        ? { ...lockable, value: "[redacted]" }
        : lockable,
    ]),
  ) as PluginLockableSettings);

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
  subtitlesOnMute: false,
  showHomeTitles: true,
  defaultVideoOrientation: ScreenOrientation.OrientationLock.DEFAULT,
  forwardSkipTime: 30,
  rewindSkipTime: 10,
  showCustomMenuLinks: false,
  disableHapticFeedback: false,
  subtitleSize: 100, // Scale value * 100, so 100 = 1.0x
  safeAreaInControlsEnabled: true,
  jellyseerrServerUrl: undefined,
  jellyseerrApiKey: undefined,
  autoLoginJellyseerr: true,
  useKefinTweaks: false,
  hiddenLibraries: [],
  enableH265ForChromecast: false,
  maxAutoPlayEpisodeCount: { key: "3", value: 3 },
  autoPlayEpisodeCount: 0,
  autoPlayNextEpisode: true,
  showResumeDialog: true,
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
  holdToSpeedRate: 2.0,
  enablePinchToZoom: true,
  enableDoubleTapToSeek: false,
  hideVolumeSlider: false,
  hideBrightnessSlider: false,
  usePopularPlugin: true,
  mergeNextUpAndContinueWatching: false,
  hiddenHomeHeroSections: [],
  hiddenHomeHeroMediaTypes: [],
  useEpisodeImagesForNextUp: false,
  // TV-specific settings
  nativeVideoPlayerTV: true,
  nativeVideoPlayerAndroidTV: false,
  appleTvTopShelfLayout: AppleTVTopShelfLayout.Sectioned,
  appleTvTopShelfContent: AppleTVTopShelfContent.ContinueAndNextUp,
  appleTvTopShelfRecommendationsType: AppleTVTopShelfRecommendationsType.All,
  showHomeBackdrop: true,
  showHeroCarousel: true,
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
  // Optional third-party lookups
  wikidataAwardsEnabled: true,
  openSubtitlesEnabled: true,
  // TV-only: Inactivity timeout (disabled by default)
  inactivityTimeout: InactivityTimeout.Disabled,
  // Crash reporting defaults on; the intro sheet and settings expose the opt-out
  sentryEnabled: true,
};

const loadSettings = (): Partial<Settings> => {
  const stored = readStoredSettings() as Partial<Settings> & {
    showTVHeroCarousel?: boolean;
  };
  // `showTVHeroCarousel` became `showHeroCarousel` once the hero shipped on
  // phones too and the two were merged into one switch. Carry a stored TV
  // preference across so a hero someone had turned off stays off.
  if (
    stored.showHeroCarousel === undefined &&
    stored.showTVHeroCarousel !== undefined
  ) {
    return { ...stored, showHeroCarousel: stored.showTVHeroCarousel };
  }
  return stored;
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
    storage.set(SETTINGS_KEY, jsonValue);
  } catch (error) {
    // The user's change is silently lost when this fails.
    logAndCaptureError("Saving settings failed", error);
  }
};

export const settingsAtom = atom<Partial<Settings> | null>(null);

/**
 * Server-side counterpart to the `showTVHeroCarousel` migration in
 * `loadSettings`: the Streamyfin plugin config still keys the hero switch
 * under the old name, so alias it or an admin's existing lock and default
 * would quietly stop being enforced after the rename.
 */
const migratePluginSettings = (
  settings: PluginLockableSettings | undefined,
): PluginLockableSettings | undefined => {
  if (!settings) {
    return settings;
  }
  const legacy = (settings as Record<string, unknown>).showTVHeroCarousel;
  if (settings.showHeroCarousel !== undefined || legacy === undefined) {
    return settings;
  }
  return {
    ...settings,
    showHeroCarousel: legacy as PluginLockableSettings["showHeroCarousel"],
  };
};

const loadPluginSettings = () => {
  try {
    return migratePluginSettings(
      storage.get<PluginLockableSettings>(STREAMYFIN_PLUGIN_SETTINGS),
    );
  } catch (error) {
    // Without the plugin settings the server admin's policy is not applied.
    logAndCaptureError("Loading plugin settings failed", error);
    return undefined;
  }
};

export const pluginSettingsAtom = atom<PluginLockableSettings | undefined>(
  loadPluginSettings(),
);

/**
 * User settings with the admin's plugin overrides applied — the same value
 * `useSettings().settings` returns, as an atom.
 *
 * Components that need a single setting should subscribe to this (or a
 * `selectAtom` of it) instead of calling `useSettings`, which also pulls in the
 * mutation helpers and a load effect.
 */
export const effectiveSettingsAtom = atom<Settings>((get) =>
  resolveEffectiveSettings(
    get(settingsAtom),
    get(pluginSettingsAtom),
    defaultValues,
    normalizePluginValue,
  ),
);

const PLUGIN_APPLIED_DEFAULTS = "STREAMYFIN_PLUGIN_APPLIED_DEFAULTS";

const loadAppliedPluginDefaults = (): AppliedPluginDefaults => {
  try {
    return storage.get<AppliedPluginDefaults>(PLUGIN_APPLIED_DEFAULTS) ?? {};
  } catch {
    return {};
  }
};

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
      const migrated = migratePluginSettings(settings);
      storage.setAny(STREAMYFIN_PLUGIN_SETTINGS, migrated);
      _setPluginSettings(migrated);
    },
    [_setPluginSettings],
  );

  const refreshStreamyfinPluginSettings = useCallback(async () => {
    if (!api) {
      return;
    }
    const newPluginSettings = await api.getStreamyfinPluginConfig().then(
      ({ data }) => {
        writeInfoLog(
          "Got plugin settings",
          redactPluginSettings(data?.settings),
        );
        return data?.settings;
      },
      (_err) => undefined,
    );
    setPluginSettings(newPluginSettings);

    // Locked values are pinned at read time by resolveEffectiveSettings and
    // never written to storage. Unlocked values are only the admin's *default*,
    // so they are seeded into storage once here — after which the setting
    // behaves like any other and the user's choice sticks.
    if (newPluginSettings && _settings) {
      const applied = loadAppliedPluginDefaults();
      const pending = pendingPluginDefaults(
        newPluginSettings,
        applied,
        normalizePluginValue,
      );

      const streamyStatsUrl = newPluginSettings.streamyStatsServerUrl;
      const enableStreamystats =
        streamyStatsUrl?.value && _settings.searchEngine !== "Streamystats";

      if (Object.keys(pending).length > 0 || enableStreamystats) {
        const newSettings = {
          ...defaultValues,
          ..._settings,
          ...pending,
          ...(enableStreamystats ? { searchEngine: "Streamystats" } : {}),
        } as Settings;
        setSettings(newSettings);
        saveSettings(newSettings);
        if (Object.keys(pending).length > 0) {
          storage.setAny(PLUGIN_APPLIED_DEFAULTS, { ...applied, ...pending });
        }
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

  const settings = useAtomValue(effectiveSettingsAtom);

  return {
    settings,
    updateSettings,
    pluginSettings,
    setPluginSettings,
    refreshStreamyfinPluginSettings,
  };
};
