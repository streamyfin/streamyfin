/**
 * Casting Player Transport Controls
 * Playback transport row: rewind, play/pause, forward.
 */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";

interface CastPlayerTransportControlsProps {
  /** Whether playback is currently playing. */
  isPlaying: boolean;
  /** Toggle play/pause on the Chromecast. */
  togglePlayPause: () => Promise<void>;
  /** Skip backward by the given number of seconds. */
  skipBackward: (seconds: number) => Promise<void>;
  /** Skip forward by the given number of seconds. */
  skipForward: (seconds: number) => Promise<void>;
  /** Configured rewind skip time in seconds, shown on the rewind button. */
  rewindSkipTime: number | null | undefined;
  /** Configured forward skip time in seconds, shown on the forward button. */
  forwardSkipTime: number | null | undefined;
  /** Accent color used for the play/pause button background. */
  protocolColor: string;
}

export function CastPlayerTransportControls({
  isPlaying,
  togglePlayPause,
  skipBackward,
  skipForward,
  rewindSkipTime,
  forwardSkipTime,
  protocolColor,
}: CastPlayerTransportControlsProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 32,
        marginBottom: 24,
      }}
    >
      {/* Rewind (use settings) */}
      <Pressable
        onPress={() => skipBackward(rewindSkipTime ?? 10)}
        style={{
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons
          name='refresh-outline'
          size={48}
          color='white'
          style={{ transform: [{ scaleY: -1 }, { rotate: "180deg" }] }}
        />
        {rewindSkipTime != null && (
          <Text
            style={{
              position: "absolute",
              color: "white",
              fontSize: 15,
              fontWeight: "bold",
              bottom: 10,
            }}
          >
            {rewindSkipTime}
          </Text>
        )}
      </Pressable>

      {/* Play/Pause */}
      <Pressable
        onPress={togglePlayPause}
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: protocolColor,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={36}
          color='white'
          style={{ marginLeft: isPlaying ? 0 : 4 }}
        />
      </Pressable>

      {/* Forward (use settings) */}
      <Pressable
        onPress={() => skipForward(forwardSkipTime ?? 10)}
        style={{
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name='refresh-outline' size={48} color='white' />
        {forwardSkipTime != null && (
          <Text
            style={{
              position: "absolute",
              color: "white",
              fontSize: 15,
              fontWeight: "bold",
              bottom: 10,
            }}
          >
            {forwardSkipTime}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
