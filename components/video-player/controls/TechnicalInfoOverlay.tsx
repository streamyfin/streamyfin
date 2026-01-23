import { type FC, memo, useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TechnicalInfo } from "@/modules/mpv-player";
import { useSettings } from "@/utils/atoms/settings";
import { HEADER_LAYOUT } from "./constants";

type PlayMethod = "DirectPlay" | "DirectStream" | "Transcode";

interface TechnicalInfoOverlayProps {
  showControls: boolean;
  visible: boolean;
  getTechnicalInfo: () => Promise<TechnicalInfo>;
  playMethod?: PlayMethod;
  transcodeReasons?: string[];
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
  };
  return codecMap[codec.toLowerCase()] || codec.toUpperCase();
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
  ({ visible, getTechnicalInfo, playMethod, transcodeReasons }) => {
    const { settings } = useSettings();
    const insets = useSafeAreaInsets();
    const [info, setInfo] = useState<TechnicalInfo | null>(null);

    const opacity = useSharedValue(0);

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

    // Hide on TV platforms
    if (Platform.isTV) return null;

    // Don't render if not visible
    if (!visible) return null;

    return (
      <Animated.View
        style={[
          styles.container,
          animatedStyle,
          {
            top:
              (settings?.safeAreaInControlsEnabled ?? true)
                ? insets.top + HEADER_LAYOUT.CONTAINER_PADDING + 4
                : HEADER_LAYOUT.CONTAINER_PADDING + 4,
            left:
              (settings?.safeAreaInControlsEnabled ?? true)
                ? insets.left + HEADER_LAYOUT.CONTAINER_PADDING + 20
                : HEADER_LAYOUT.CONTAINER_PADDING + 20,
          },
        ]}
        pointerEvents='none'
      >
        <View style={styles.infoBox}>
          {playMethod && (
            <Text
              style={[
                styles.infoText,
                { color: getPlayMethodColor(playMethod) },
              ]}
            >
              {getPlayMethodLabel(playMethod)}
            </Text>
          )}
          {transcodeReasons && transcodeReasons.length > 0 && (
            <Text style={[styles.infoText, styles.reasonText]}>
              {transcodeReasons.map(formatTranscodeReason).join(", ")}
            </Text>
          )}
          {info?.videoWidth && info?.videoHeight && (
            <Text style={styles.infoText}>
              {info.videoWidth}x{info.videoHeight}
            </Text>
          )}
          {info?.videoCodec && (
            <Text style={styles.infoText}>
              Video: {formatCodec(info.videoCodec)}
              {info.fps ? ` @ ${formatFps(info.fps)} fps` : ""}
            </Text>
          )}
          {info?.audioCodec && (
            <Text style={styles.infoText}>
              Audio: {formatCodec(info.audioCodec)}
            </Text>
          )}
          {(info?.videoBitrate || info?.audioBitrate) && (
            <Text style={styles.infoText}>
              Bitrate:{" "}
              {info.videoBitrate
                ? formatBitrate(info.videoBitrate)
                : info.audioBitrate
                  ? formatBitrate(info.audioBitrate)
                  : "N/A"}
            </Text>
          )}
          {info?.cacheSeconds !== undefined && (
            <Text style={styles.infoText}>
              Buffer: {info.cacheSeconds.toFixed(1)}s
            </Text>
          )}
          {info?.droppedFrames !== undefined && info.droppedFrames > 0 && (
            <Text style={[styles.infoText, styles.warningText]}>
              Dropped: {info.droppedFrames} frames
            </Text>
          )}
          {!info && !playMethod && (
            <Text style={styles.infoText}>Loading...</Text>
          )}
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
  infoText: {
    color: "white",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  warningText: {
    color: "#ff9800",
  },
  reasonText: {
    color: "#fbbf24",
    fontSize: 10,
  },
});
