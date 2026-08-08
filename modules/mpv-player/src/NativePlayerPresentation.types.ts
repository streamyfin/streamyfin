/**
 * TS mirror of the native player presentation contract.
 * Swift side: modules/mpv-player/ios/NativePlayer/PlayerConfig.swift +
 * NativePlayerModule.swift. All positions/durations cross the bridge in
 * seconds (or ms where named) — JS converts Jellyfin ticks before handing
 * anything down; native never sees ticks.
 */

export type NativePlayerPlayMethod =
  | "DirectPlay"
  | "DirectStream"
  | "Transcode";

export type NativePlayerStreamConfig = {
  url: string;
  headers?: Record<string, string>;
  externalSubtitles?: string[];
  startPositionSec?: number;
  autoplay?: boolean;
  /** MPV track ids pre-resolved by JS (1-based; -1 disables subtitles). */
  initialSubtitleMpvId?: number;
  initialAudioMpvId?: number;
  playMethod?: NativePlayerPlayMethod;
  transcodeReasons?: string[];
  cacheConfig?: {
    enabled?: "auto" | "yes" | "no";
    cacheSeconds?: number;
    maxBytes?: number;
    maxBackBytes?: number;
  };
  /** Source video dimensions (for zoom-to-fill subtitle compensation). */
  videoWidth?: number;
  videoHeight?: number;
};

export type NativePlayerMetadata = {
  /** Jellyfin item id — identifies whether a load() swap changed the item. */
  itemId?: string;
  title?: string;
  /** Second header line, e.g. "Series Name · S2E5". */
  subtitle?: string;
  artworkUri?: string;
  isEpisode?: boolean;
};

export type NativePlayerChapter = {
  name?: string;
  startSec: number;
};

export type NativePlayerSegmentType = "Intro" | "Outro";

export type NativePlayerSegment = {
  type: NativePlayerSegmentType;
  startSec: number;
  endSec: number;
};

export type NativePlayerTrickplay = {
  intervalMs: number;
  /** Tiles per row (Jellyfin TileWidth). */
  tileCols: number;
  /** Tiles per column (Jellyfin TileHeight). */
  tileRows: number;
  /** Pixels per thumbnail. */
  thumbWidth: number;
  thumbHeight: number;
  /**
   * Fully-formed per-sheet URLs, index = sheet index. Online these carry
   * the ApiKey query param; offline they are file:// paths.
   */
  sheetUrls: string[];
  headers?: Record<string, string>;
};

export type NativePlayerNextEpisode = {
  itemId: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  /** 0 = no auto-countdown; show the "Next episode" button only. */
  countdownSeconds?: number;
  /**
   * The autoplay episode cap is reached: EOF shows the "Still watching?"
   * card instead of auto-advancing (countdownSeconds is 0 in that case).
   * Continue emits onNextEpisodeRequested with reason "userTap", which
   * resets the autoplay counter JS-side.
   */
  stillWatchingRequired?: boolean;
};

export type NativePlayerTrackMenuItem = {
  label: string;
  jellyfinIndex: number;
  selected?: boolean;
  /**
   * Selecting this item forces a stream re-negotiation (burned-in subtitle,
   * audio change while transcoding) — native won't optimistically checkmark
   * it; push updateTrackMenus with the truth after applying.
   */
  requiresReload?: boolean;
};

export type NativePlayerTrackMenus = {
  /** Include the "Off" item (jellyfinIndex = -1), labeled via i18n. */
  subtitles: NativePlayerTrackMenuItem[];
  audio: NativePlayerTrackMenuItem[];
  /**
   * Max-bitrate options (online only; omit/empty offline). jellyfinIndex
   * carries the bitrate in bps, -1 = "Max". Selection always re-negotiates.
   */
  quality?: NativePlayerTrackMenuItem[];
};

export type NativePlayerEpisodeListItem = {
  itemId: string;
  title: string;
  indexNumber?: number;
  imageUrl?: string;
  /** 0-100 watched progress. */
  progressPercent?: number;
  isCurrent?: boolean;
};

export type NativePlayerSubtitleStyle = {
  fontSize?: number;
  scale?: number;
  marginY?: number;
  alignX?: "left" | "center" | "right";
  alignY?: "top" | "center" | "bottom";
  backgroundColor?: string;
  borderStyle?: "outline-and-shadow" | "background-box";
  assOverride?: "no" | "force";
};

/**
 * Localized labels handed to the native UI; English fallbacks apply.
 * endsAt carries a literal %TIME% placeholder the native side substitutes.
 */
export type NativePlayerStrings = Partial<
  Record<
    | "skipIntro"
    | "skipCredits"
    | "nextEpisode"
    | "playNow"
    | "cancel"
    | "episodes"
    | "speed"
    | "audio"
    | "subtitles"
    | "chapters"
    | "technicalInfo"
    | "playbackError"
    | "close"
    | "off"
    | "quality"
    | "subtitleSize"
    | "subtitleSync"
    | "audioSync"
    | "volumeBoost"
    | "rotate"
    | "lockControls"
    | "unlock"
    | "stillWatching"
    | "continueWatching"
    | "goBack"
    | "endsAt"
    | "zoomToFill",
    string
  >
>;

export type NativePlayerUIOptions = {
  orientationLock?: "landscape" | "none";
  allowPip?: boolean;
  seekForwardSec?: number;
  seekBackwardSec?: number;
  initialPlaybackSpeed?: number;
  /** false disables all in-player haptics (settings.disableHapticFeedback). */
  hapticsEnabled?: boolean;
  /** false hides the right-edge volume slider (settings.hideVolumeSlider). */
  showVolumeSlider?: boolean;
  /** false hides the left-edge brightness slider (settings.hideBrightnessSlider). */
  showBrightnessSlider?: boolean;
  strings?: NativePlayerStrings;
};

export type NativePlayerConfig = {
  stream: NativePlayerStreamConfig;
  metadata?: NativePlayerMetadata;
  chapters?: NativePlayerChapter[];
  segments?: NativePlayerSegment[];
  trickplay?: NativePlayerTrickplay;
  nextEpisode?: NativePlayerNextEpisode;
  episodeList?: NativePlayerEpisodeListItem[];
  tracks?: NativePlayerTrackMenus;
  subtitleStyle?: NativePlayerSubtitleStyle;
  ui?: NativePlayerUIOptions;
};

// MARK: - Events

export type NativePlayerProgressPayload = {
  position: number;
  duration: number;
  progress: number;
  cacheSeconds: number;
  /** Present (true) on the first tick after a user/remote seek. */
  didSeek?: boolean;
};

export type NativePlayerStateChangePayload = {
  isPaused?: boolean;
  isPlaying?: boolean;
  isLoading?: boolean;
  isReadyToSeek?: boolean;
};

export type NativePlayerTrackSelectionRequest = {
  kind: "subtitle" | "audio";
  jellyfinIndex: number;
  positionSec: number;
};

export type NativePlayerNextEpisodeRequest = {
  reason: "userTap" | "countdown";
  positionSec: number;
};

export type NativePlayerDismissReason =
  | "closeButton"
  | "programmatic"
  | "playbackEnded"
  | "error";

export type NativePlayerDismissPayload = {
  positionSec: number;
  durationSec: number;
  reason: NativePlayerDismissReason;
};

export type NativePlayerEvents = {
  onLoad: (payload: { url: string }) => void;
  onProgress: (payload: NativePlayerProgressPayload) => void;
  onPlaybackStateChange: (payload: NativePlayerStateChangePayload) => void;
  onError: (payload: { error: string }) => void;
  /**
   * Fired after embedded track enumeration AND again after each external
   * sub-add — re-run the subtitle identity resolution on every fire.
   */
  onTracksReady: (payload: Record<string, never>) => void;
  onPictureInPictureChange: (payload: { isActive: boolean }) => void;
  onTrackSelectionRequested: (
    payload: NativePlayerTrackSelectionRequest,
  ) => void;
  onSpeedChange: (payload: { speed: number }) => void;
  /** Quality menu tap; bitrateValue in bps, -1 = "Max" (no limit). */
  onQualitySelected: (payload: {
    bitrateValue: number;
    positionSec: number;
  }) => void;
  /** In-player subtitle size change; persist as settings.mpvSubtitleScale. */
  onSubtitleScaleChange: (payload: { scale: number }) => void;
  /**
   * In-player rotate button. The native VC already flipped its own mask and
   * requested the geometry change, but when JS holds a window-level
   * expo-screen-orientation lock (landscape-on-open setting) it outvotes the
   * VC — JS must re-lock to the requested orientation.
   */
  onOrientationChangeRequested: (payload: {
    orientation: "portrait" | "landscape";
  }) => void;
  onNextEpisodeRequested: (payload: NativePlayerNextEpisodeRequest) => void;
  onPreviousEpisodeRequested: (payload: { positionSec: number }) => void;
  onEpisodeSelected: (payload: { itemId: string; positionSec: number }) => void;
  /** EOF with no next episode configured; native auto-dismisses after this. */
  onPlaybackEnded: (payload: { positionSec: number }) => void;
  onDismiss: (payload: NativePlayerDismissPayload) => void;
};
