import type { StyleProp, ViewStyle } from "react-native";

export type OnTracksReadyEventPayload = Record<string, never>;

export type MpvPlayerModuleEvents = {
  /** A line from the native player's Logger (iOS/tvOS only). */
  onNativeLog: (params: NativeLogEventPayload) => void;
};

export type NativeLogEventPayload = {
  message: string;
  /** Native Logger type: "Error" | "Warn" | "Info" | "General" | ... */
  type: string;
};

export type VideoSource = {
  url: string;
  autoplay?: boolean;
  /** Whether to loop the video indefinitely */
  loop?: boolean;
  /** MPV subtitle track ID to select on start (1-based, -1 to disable) */
  initialSubtitleId?: number;
};

/**
 * The embedded view, which only the subtitle preview in Settings uses, to
 * play a silent clip. It takes no audio session, media session or picture in
 * picture. Playback goes through the presented player
 * (NativePlayerPresentation).
 */
export type MpvPlayerViewProps = {
  source?: VideoSource;
  style?: StyleProp<ViewStyle>;
  onTracksReady?: (event: { nativeEvent: OnTracksReadyEventPayload }) => void;
};

export interface SubtitleStyleConfig {
  fontSize?: number;
  color?: string;
  font?: string;
  background?: string; // hex color with alpha
  backgroundPadding?: number;
}

export interface MpvPlayerViewRef {
  setSubtitleScale: (scale: number) => Promise<void>;
  setSubtitleMarginY: (margin: number) => Promise<void>;
  setSubtitleAlignX: (alignment: "left" | "center" | "right") => Promise<void>;
  setSubtitleAlignY: (alignment: "top" | "center" | "bottom") => Promise<void>;
  setSubtitleStyle: (style: SubtitleStyleConfig) => Promise<void>;
  setSubtitleAssOverride: (mode: "no" | "force") => Promise<void>;
}

export type SubtitleTrack = {
  id: number;
  title?: string;
  lang?: string;
  /** Subtitle codec (mpv `codec`), e.g. "subrip", "ass", "hdmv_pgs_subtitle". */
  codec?: string;
  /** True if loaded from a separate file via `sub-add` (mpv `external`). */
  external?: boolean;
  /** For external tracks: the exact URL/path it was loaded from (mpv `external-filename`). */
  externalFilename?: string;
  /** FFmpeg stream index (mpv `ff-index`); not guaranteed for non-lavf demuxers. */
  ffIndex?: number;
  selected?: boolean;
};

export type AudioTrack = {
  id: number;
  title?: string;
  lang?: string;
  codec?: string;
  channels?: number;
  selected?: boolean;
};

export type TechnicalInfo = {
  videoWidth?: number;
  videoHeight?: number;
  videoCodec?: string;
  audioCodec?: string;
  fps?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  cacheSeconds?: number;
  /** Configured demuxer forward cache cap (MiB), read back from mpv */
  demuxerMaxBytes?: number;
  /** Configured demuxer backward cache cap (MiB), read back from mpv */
  demuxerMaxBackBytes?: number;
  /** Configured cache-secs floor, read back from mpv */
  cacheSecsLimit?: number;
  droppedFrames?: number;
  /** Active video output driver (read from MPV at runtime) */
  voDriver?: string;
  /** Active hardware decoder (read from MPV at runtime) */
  hwdec?: string;
  /** Estimated video output fps (mpv "estimated-vf-fps") */
  estimatedVfFps?: number;
  // ---- Extended fields (primarily ExoPlayer-backed; MPV may fill some) ----
  /** Derived HDR format: "SDR" | "HDR10" | "HDR10+" | "HLG" | null */
  hdrFormat?: string;
  /** Color space, e.g. "BT.709" / "BT.2020" */
  colorSpace?: string;
  /** Color range: "Limited" / "Full" */
  colorRange?: string;
  /** Color transfer: "SDR" / "ST2084 (PQ)" / "HLG" */
  colorTransfer?: string;
  /** Decoder path: "hardware" (MediaCodec) or "software" (FFmpeg extension) */
  decoderType?: string;
  /** Instantiated decoder name, e.g. "c2.amlogic.hevc.decoder" */
  decoderName?: string;
  /** Active audio channel count (2 = stereo, 6 = 5.1, 8 = 7.1) */
  audioChannels?: number;
  /** Active audio sample rate in Hz */
  audioSampleRate?: number;
  /**
   * Raw codec tag from the container, e.g. "hev1.2.4.L153.B0". Encodes
   * profile / tier / level / constraint bytes per ISO/IEC 14496-15. Power
   * users can decode this manually; it's how Jellyfin's HEVC level cap
   * (153 = Level 5.1) is checked against the file.
   */
  videoCodecs?: string;
};
