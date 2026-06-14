import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client";
import {
  type FC,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import type { TechnicalInfo } from "@/modules/mpv-player";
import { HEADER_LAYOUT } from "./constants";

type PlayMethod = "DirectPlay" | "DirectStream" | "Transcode";

interface TechnicalInfoOverlayProps {
  showControls: boolean;
  visible: boolean;
  getTechnicalInfo: () => Promise<TechnicalInfo>;
  playMethod?: PlayMethod;
  transcodeReasons?: string[];
  mediaSource?: MediaSourceInfo | null;
  currentSubtitleIndex?: number;
  currentAudioIndex?: number;
}

const formatBitrate = (bitsPerSecond: number): string => {
  const mbps = bitsPerSecond / 1_000_000;
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} Mbps`;
  }
  const kbps = bitsPerSecond / 1_000;
  return `${kbps.toFixed(0)} Kbps`;
};

const formatCodec = (codec: string): string => {
  // Normalize common codec names
  const codecMap: Record<string, string> = {
    h264: "H.264",
    hevc: "HEVC",
    h265: "HEVC",
    vp9: "VP9",
    vp8: "VP8",
    av1: "AV1",
    aac: "AAC",
    ac3: "AC3",
    eac3: "E-AC3",
    dts: "DTS",
    truehd: "TrueHD",
    flac: "FLAC",
    opus: "Opus",
    mp3: "MP3",
    // Subtitle codecs
    srt: "SRT",
    subrip: "SRT",
    ass: "ASS",
    ssa: "SSA",
    webvtt: "WebVTT",
    vtt: "WebVTT",
    pgs: "PGS",
    hdmv_pgs_subtitle: "PGS",
    dvd_subtitle: "VobSub",
    dvdsub: "VobSub",
    mov_text: "MOV Text",
    cc_dec: "CC",
    eia_608: "CC",
  };
  return codecMap[codec.toLowerCase()] || codec.toUpperCase();
};

const formatAudioChannels = (channels: number): string => {
  switch (channels) {
    case 1:
      return "Mono";
    case 2:
      return "Stereo";
    case 6:
      return "5.1";
    case 8:
      return "7.1";
    default:
      return `${channels}ch`;
  }
};

const formatVideoRange = (range?: string | null): string | null => {
  if (!range || range === "SDR") return null;
  const rangeMap: Record<string, string> = {
    HDR10: "HDR10",
    HDR10Plus: "HDR10+",
    HLG: "HLG",
    "Dolby Vision": "Dolby Vision",
    DolbyVision: "Dolby Vision",
  };
  return rangeMap[range] || range;
};

const formatFps = (fps: number): string => {
  // Common frame rates
  if (Math.abs(fps - 23.976) < 0.01) return "23.976";
  if (Math.abs(fps - 29.97) < 0.01) return "29.97";
  if (Math.abs(fps - 59.94) < 0.01) return "59.94";
  if (Number.isInteger(fps)) return fps.toString();
  return fps.toFixed(2);
};

const getPlayMethodLabel = (method: PlayMethod): string => {
  switch (method) {
    case "DirectPlay":
      return "Direct Play";
    case "DirectStream":
      return "Direct Stream";
    case "Transcode":
      return "Transcoding";
    default:
      return method;
  }
};

const getPlayMethodColor = (method: PlayMethod): string => {
  switch (method) {
    case "DirectPlay":
      return "#4ade80"; // green
    case "DirectStream":
      return "#60a5fa"; // blue
    case "Transcode":
      return "#fbbf24"; // yellow/amber
    default:
      return "white";
  }
};

const formatTranscodeReason = (reason: string): string => {
  // Convert camelCase/PascalCase to readable format
  const reasonMap: Record<string, string> = {
    ContainerNotSupported: "Container not supported",
    VideoCodecNotSupported: "Video codec not supported",
    AudioCodecNotSupported: "Audio codec not supported",
    SubtitleCodecNotSupported: "Subtitle codec not supported",
    AudioIsExternal: "Audio is external",
    SecondaryAudioNotSupported: "Secondary audio not supported",
    VideoProfileNotSupported: "Video profile not supported",
    VideoLevelNotSupported: "Video level not supported",
    VideoResolutionNotSupported: "Resolution not supported",
    VideoBitDepthNotSupported: "Bit depth not supported",
    VideoFramerateNotSupported: "Framerate not supported",
    RefFramesNotSupported: "Ref frames not supported",
    AnamorphicVideoNotSupported: "Anamorphic video not supported",
    InterlacedVideoNotSupported: "Interlaced video not supported",
    AudioChannelsNotSupported: "Audio channels not supported",
    AudioProfileNotSupported: "Audio profile not supported",
    AudioSampleRateNotSupported: "Sample rate not supported",
    AudioBitDepthNotSupported: "Audio bit depth not supported",
    ContainerBitrateExceedsLimit: "Bitrate exceeds limit",
    VideoBitrateNotSupported: "Video bitrate not supported",
    AudioBitrateNotSupported: "Audio bitrate not supported",
    UnknownVideoStreamInfo: "Unknown video stream",
    UnknownAudioStreamInfo: "Unknown audio stream",
    DirectPlayError: "Direct play error",
    VideoRangeTypeNotSupported: "HDR not supported",
    VideoCodecTagNotSupported: "Video codec tag not supported",
  };
  return reasonMap[reason] || reason;
};

export const TechnicalInfoOverlay: FC<TechnicalInfoOverlayProps> = memo(
  ({
    showControls: _showControls,
    visible,
    getTechnicalInfo,
    playMethod,
    transcodeReasons,
    mediaSource,
    currentSubtitleIndex,
    currentAudioIndex,
  }) => {
    const typography = useScaledTVTypography();
    const insets = useSafeAreaInsets();
    const safeInsets = useControlsSafeAreaInsets();
    const [info, setInfo] = useState<TechnicalInfo | null>(null);

    const opacity = useSharedValue(0);

    // Extract stream info from media source
    const streamInfo = useMemo(() => {
      if (!mediaSource?.MediaStreams) return null;

      const videoStream = mediaSource.MediaStreams.find(
        (s) => s.Type === "Video",
      );
      const audioStream = mediaSource.MediaStreams.find(
        (s) =>
          s.Type === "Audio" &&
          (currentAudioIndex !== undefined
            ? s.Index === currentAudioIndex
            : s.IsDefault),
      );
      const subtitleStream = mediaSource.MediaStreams.find(
        (s) =>
          s.Type === "Subtitle" &&
          currentSubtitleIndex !== undefined &&
          currentSubtitleIndex >= 0 &&
          s.Index === currentSubtitleIndex,
      );

      return {
        container: mediaSource.Container,
        videoRange: videoStream?.VideoRangeType,
        bitDepth: videoStream?.BitDepth,
        audioChannels: audioStream?.Channels,
        audioCodecFromSource: audioStream?.Codec,
        subtitleCodec: subtitleStream?.Codec,
        subtitleTitle: subtitleStream?.DisplayTitle,
      };
    }, [mediaSource, currentAudioIndex, currentSubtitleIndex]);

    // Animate visibility based on visible prop only (stays visible regardless of controls)
    useEffect(() => {
      opacity.value = withTiming(visible ? 1 : 0, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    }, [visible, opacity]);

    // Fetch technical info periodically when visible
    const fetchInfo = useCallback(async () => {
      try {
        const data = await getTechnicalInfo();
        setInfo(data);
      } catch (_error) {
        // Silently fail - the info is optional
      }
    }, [getTechnicalInfo]);

    useEffect(() => {
      if (!visible) {
        return;
      }

      // Fetch immediately
      fetchInfo();

      // Then fetch every 2 seconds
      const interval = setInterval(fetchInfo, 2000);
      return () => clearInterval(interval);
    }, [visible, fetchInfo]);

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
    }));

    // Don't render if not visible
    if (!visible) return null;

    // TV-specific styles
    const containerStyle = Platform.isTV
      ? {
          top: Math.max(insets.top, 48) + 20,
          left: Math.max(insets.left, 48) + 20,
        }
      : {
          top: safeInsets.top + HEADER_LAYOUT.CONTAINER_PADDING + 4,
          left: safeInsets.left + HEADER_LAYOUT.CONTAINER_PADDING + 20,
        };

    const textStyle = Platform.isTV
      ? [
          styles.infoTextTV,
          { fontSize: typography.body, lineHeight: typography.body * 1.5 },
        ]
      : styles.infoText;
    const reasonStyle = Platform.isTV
      ? [styles.reasonTextTV, { fontSize: typography.callout }]
      : styles.reasonText;
    const boxStyle = Platform.isTV ? styles.infoBoxTV : styles.infoBox;

    return (
      <Animated.View
        style={[styles.container, animatedStyle, containerStyle]}
        pointerEvents='none'
      >
        <View style={boxStyle}>
          {playMethod && (
            <Text
              style={[textStyle, { color: getPlayMethodColor(playMethod) }]}
            >
              {getPlayMethodLabel(playMethod)}
            </Text>
          )}
          {transcodeReasons && transcodeReasons.length > 0 && (
            <Text style={[textStyle, reasonStyle]}>
              {transcodeReasons.map(formatTranscodeReason).join(", ")}
            </Text>
          )}
          {info?.videoWidth && info?.videoHeight && (
            <Text style={textStyle}>
              {info.videoWidth}x{info.videoHeight}
              {streamInfo?.bitDepth ? ` ${streamInfo.bitDepth}bit` : ""}
              {formatVideoRange(streamInfo?.videoRange)
                ? ` ${formatVideoRange(streamInfo?.videoRange)}`
                : ""}
            </Text>
          )}
          {info?.videoCodec && (
            <Text style={textStyle}>
              Video: {formatCodec(info.videoCodec)}
              {info.fps ? ` @ ${formatFps(info.fps)} fps` : ""}
            </Text>
          )}
          {info?.audioCodec && (
            <Text style={textStyle}>
              Audio: {formatCodec(info.audioCodec)}
              {streamInfo?.audioChannels
                ? ` ${formatAudioChannels(streamInfo.audioChannels)}`
                : ""}
            </Text>
          )}
          {streamInfo?.subtitleCodec && (
            <Text style={textStyle}>
              Subtitle: {formatCodec(streamInfo.subtitleCodec)}
            </Text>
          )}
          {(info?.videoBitrate || info?.audioBitrate) && (
            <Text style={textStyle}>
              Bitrate:{" "}
              {info.videoBitrate
                ? formatBitrate(info.videoBitrate)
                : info.audioBitrate
                  ? formatBitrate(info.audioBitrate)
                  : "N/A"}
            </Text>
          )}
          {info?.cacheSeconds !== undefined && (
            <Text style={textStyle}>
              Buffer: {info.cacheSeconds.toFixed(1)}s
            </Text>
          )}
          {info?.voDriver && (
            <Text style={textStyle}>
              VO: {info.voDriver}
              {info.hwdec ? ` / ${info.hwdec}` : ""}
            </Text>
          )}
          {info?.droppedFrames !== undefined && info.droppedFrames > 0 && (
            <Text style={[textStyle, styles.warningText]}>
              Dropped: {info.droppedFrames} frames
            </Text>
          )}
          {!info && !playMethod && <Text style={textStyle}>Loading...</Text>}
        </View>
      </Animated.View>
    );
  },
);

TechnicalInfoOverlay.displayName = "TechnicalInfoOverlay";

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 15,
  },
  infoBox: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 150,
  },
  infoBoxTV: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    minWidth: 250,
  },
  infoText: {
    color: "white",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  infoTextTV: {
    color: "white",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  warningText: {
    color: "#ff9800",
  },
  reasonText: {
    color: "#fbbf24",
    fontSize: 10,
  },
  reasonTextTV: {
    color: "#fbbf24",
  },
});
