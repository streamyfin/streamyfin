/**
 * SyncPlaySpinner
 *
 * Compact rotating SyncPlay icon shown in place of the play/pause button
 * while a play/pause command is in flight to the server (the "schedule-play"
 * indicator from jellyfin-web).
 */

import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// SyncPlay cyan color (matches jellyfin-web)
const SYNC_PLAY_COLOR = "#00a4dc";

interface SyncPlaySpinnerProps {
  size: number;
  color?: string;
}

export function SyncPlaySpinner({
  size,
  color = SYNC_PLAY_COLOR,
}: SyncPlaySpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1200,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name='sync' size={size} color={color} />
    </Animated.View>
  );
}
