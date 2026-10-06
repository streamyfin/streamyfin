import { useState } from "react";
import {
  type AccessibilityRole,
  ActivityIndicator,
  Pressable,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/common/Text";

interface Props {
  children: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
  checked?: boolean;
}

/** Keeps busy/disabled actions and remote focus consistent on every platform. */
export function SyncPlayAction({
  children,
  onPress,
  testID,
  disabled = false,
  loading = false,
  secondary = false,
  destructive = false,
  style,
  accessibilityRole = "button",
  accessibilityHint,
  checked,
}: Props) {
  const [focused, setFocused] = useState(false);
  const unavailable = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={children}
      accessibilityState={{ disabled: unavailable, busy: loading, checked }}
      disabled={unavailable}
      focusable={!unavailable}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        {
          minHeight: 48,
          paddingVertical: 12,
          paddingHorizontal: 18,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: focused ? "#fff" : "transparent",
          backgroundColor: destructive
            ? "#7f1d1d"
            : secondary
              ? "#262626"
              : "#7e22ce",
          opacity: unavailable ? 0.45 : pressed ? 0.7 : 1,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {loading && <ActivityIndicator color='white' size='small' />}
        <Text style={{ fontSize: 16, fontWeight: "600" }}>{children}</Text>
      </View>
    </Pressable>
  );
}
