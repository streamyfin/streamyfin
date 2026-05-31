/**
 * SyncPlayIndicator
 *
 * Visual indicator shown during SyncPlay operations.
 * Only appears when user's stream is ready but waiting for other group members.
 *
 * Key principle: SyncPlay indicator = "You're ready, waiting on others"
 */

import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";

// SyncPlay cyan color (matches Jellyfin-web)
const SYNC_PLAY_COLOR = "#00a4dc";

interface SyncPlayIndicatorProps {
  /**
   * Whether the indicator should be visible.
   * Should only be true when:
   * 1. User's stream has loaded
   * 2. Waiting for other group members
   */
  visible: boolean;

  /**
   * Optional message to display
   */
  message?: string;
}

export function SyncPlayIndicator({
  visible,
  message,
}: SyncPlayIndicatorProps) {
  const { t } = useTranslation();
  const displayMessage = message ?? t("syncplay.waiting_for_group");
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withRepeat(
        withTiming(1.15, {
          duration: 800,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = 1;
    }
  }, [visible, opacity, scale]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!visible) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.content}>
        {/* Pulsing icon container */}
        <Animated.View style={[styles.iconContainer, pulseStyle]}>
          <View style={styles.iconCircle}>
            <Ionicons name='people' size={28} color='white' />
          </View>
        </Animated.View>

        {/* Message */}
        <Text style={styles.message}>{displayMessage}</Text>

        {/* SyncPlay badge */}
        <View style={styles.badge}>
          <Ionicons name='sync' size={12} color='white' />
          <Text style={styles.badgeText}>SyncPlay</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 100,
  },
  content: {
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SYNC_PLAY_COLOR,
    justifyContent: "center",
    alignItems: "center",
    // Glow effect
    shadowColor: SYNC_PLAY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  message: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 164, 220, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SYNC_PLAY_COLOR,
  },
  badgeText: {
    color: SYNC_PLAY_COLOR,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
});

/**
 * Hook-compatible version that reads SyncPlay state directly
 */
export function useSyncPlayIndicatorState(
  isLocalReady: boolean,
  isGroupWaiting: boolean,
): boolean {
  // Show indicator only when:
  // 1. User's local stream has loaded (isLocalReady)
  // 2. Group is still waiting for others (isGroupWaiting)
  return isLocalReady && isGroupWaiting;
}
