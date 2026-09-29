/**
 * SyncPlayActionIcon
 *
 * In-button SyncPlay status indicator — drops into the player's
 * play/pause button slot and replaces the normal play/pause/loader
 * graphic while SyncPlay is mid-transition. Mirrors jellyfin-web's
 * `#syncPlayIcon` element (see `showIcon()` in
 * `jellyfin-web/src/controllers/playback/video/index.js`).
 *
 * Icon vocabulary (matched 1:1 with jellyfin-web's `showIcon` switch):
 *
 *   action          primary       secondary         pulse      spin
 *   --------------- ------------- ----------------- ---------- ----
 *   schedule-play   sync          play (centered)   infinite   yes
 *   unpause         play-circle   —                 one-shot   no
 *   pause           pause-circle  —                 one-shot   no
 *   seek            refresh       —                 infinite   no
 *   buffering       clock         —                 infinite   no
 *   wait-pause      clock         pause (shifted)   infinite   no
 *   wait-unpause    clock         play (shifted)    infinite   no
 *
 * Material → Ionicons mapping used here:
 *   sync → sync, schedule → time-outline, update → refresh-outline,
 *   play_arrow → play, pause → pause,
 *   play_circle_outline → play-circle-outline,
 *   pause_circle_outline → pause-circle-outline.
 *
 * When no SyncPlay action is active the component renders `fallback`
 * so callers can keep the normal play/pause/loader graphic.
 */

import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { SyncPlayOsdAction } from "@/providers/SyncPlay";
import { useSyncPlay } from "@/providers/SyncPlay";

// SyncPlay cyan (matches jellyfin-web's `.syncPlayIconCircle` color)
const SYNC_PLAY_COLOR = "#00a4dc";

type IoniconName = keyof typeof Ionicons.glyphMap;

type SecondaryPosition = "centered" | "shifted";

interface SecondaryIcon {
  icon: IoniconName;
  position: SecondaryPosition;
}

interface OsdConfig {
  /** Primary icon — fills the available size. */
  icon: IoniconName;
  /** Optional smaller overlay (~42% size). */
  secondary?: SecondaryIcon;
  /** Wrapper-level scale animation. */
  pulse: "infinite" | "oneshot";
  /** Rotate the primary icon continuously (secondary stays still). */
  spin?: boolean;
}

const CONFIG: Record<SyncPlayOsdAction, OsdConfig> = {
  "schedule-play": {
    icon: "sync",
    secondary: { icon: "play", position: "centered" },
    pulse: "infinite",
    spin: true,
  },
  unpause: { icon: "play-circle-outline", pulse: "oneshot" },
  pause: { icon: "pause-circle-outline", pulse: "oneshot" },
  seek: { icon: "refresh-outline", pulse: "infinite" },
  buffering: { icon: "time-outline", pulse: "infinite" },
  "wait-pause": {
    icon: "time-outline",
    secondary: { icon: "pause", position: "shifted" },
    pulse: "infinite",
  },
  "wait-unpause": {
    icon: "time-outline",
    secondary: { icon: "play", position: "shifted" },
    pulse: "infinite",
  },
};

interface SyncPlayActionIconProps {
  size: number;
  color?: string;
  /** Rendered when no SyncPlay action is active. */
  fallback?: ReactNode;
}

export function SyncPlayActionIcon({
  size,
  color = SYNC_PLAY_COLOR,
  fallback = null,
}: SyncPlayActionIconProps) {
  const { osdAction } = useSyncPlay();

  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(rotation);
    cancelAnimation(scale);
    rotation.value = 0;
    scale.value = 1;

    if (!osdAction) return;

    const config = CONFIG[osdAction];

    if (config.spin) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false,
      );
    }

    if (config.pulse === "infinite") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.1, {
            duration: 700,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0.95, {
            duration: 700,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
        true,
      );
    } else {
      // one-shot: single scale flash; the provider clears the action
      // ~1500ms later (transient OSD) so the icon then unmounts.
      scale.value = withSequence(
        withTiming(1.2, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 220, easing: Easing.inOut(Easing.quad) }),
      );
    }
  }, [osdAction, rotation, scale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (!osdAction) return <>{fallback}</>;

  const config = CONFIG[osdAction];
  const secondarySize = Math.round(size * 0.42);

  // centered: geometric middle of the primary (e.g. play arrow inside
  // the spinning `sync` ring for schedule-play).
  // shifted: bottom-right corner (e.g. play/pause badge on the clock
  // for wait-unpause / wait-pause).
  const secondaryPosStyle =
    config.secondary?.position === "centered"
      ? {
          top: (size - secondarySize) / 2,
          left: (size - secondarySize) / 2,
        }
      : { bottom: 0, right: 0 };

  return (
    <Animated.View style={pulseStyle}>
      <View style={{ width: size, height: size }}>
        <Animated.View style={[StyleSheet.absoluteFill, spinStyle]}>
          <Ionicons name={config.icon} size={size} color={color} />
        </Animated.View>

        {config.secondary && (
          <View
            pointerEvents='none'
            style={[styles.secondary, secondaryPosStyle]}
          >
            <Ionicons
              name={config.secondary.icon}
              size={secondarySize}
              color={color}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  secondary: {
    position: "absolute",
  },
});
