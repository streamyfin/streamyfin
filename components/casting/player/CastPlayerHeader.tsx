/**
 * Casting Player Header
 * Fixed top bar: dismiss button, connection indicator, settings button.
 */

import { Ionicons } from "@expo/vector-icons";
import type { TFunction } from "i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";

interface CastPlayerHeaderProps {
  /** Top safe-area inset, used to offset the fixed header. */
  insetTop: number;
  /** Streamyfin protocol accent color. */
  protocolColor: string;
  /** Friendly name of the connected cast device, or null. */
  currentDevice: string | null;
  /** Translation function. */
  t: TFunction;
  /** Dismiss the casting player modal. */
  onDismiss: () => void;
  /** Open the device sheet (connection indicator press). */
  onPressConnectionIndicator: () => void;
  /** Open the settings menu. */
  onPressSettings: () => void;
}

export function CastPlayerHeader({
  insetTop,
  protocolColor,
  currentDevice,
  t,
  onDismiss,
  onPressConnectionIndicator,
  onPressSettings,
}: CastPlayerHeaderProps) {
  return (
    <View
      style={{
        position: "absolute",
        top: insetTop + 8,
        left: 20,
        right: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 100,
      }}
    >
      <Pressable onPress={onDismiss} style={{ padding: 8, marginLeft: -8 }}>
        <Ionicons name='chevron-down' size={32} color='white' />
      </Pressable>

      {/* Connection indicator */}
      <Pressable
        onPress={onPressConnectionIndicator}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: "#1a1a1a",
          borderRadius: 16,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: protocolColor,
          }}
        />
        <Text
          style={{
            color: protocolColor,
            fontSize: 14,
            fontWeight: "500",
          }}
        >
          {currentDevice || t("casting_player.unknown_device")}
        </Text>
      </Pressable>

      <Pressable
        onPress={onPressSettings}
        style={{ padding: 8, marginRight: -8 }}
      >
        <Ionicons name='settings-outline' size={24} color='white' />
      </Pressable>
    </View>
  );
}
