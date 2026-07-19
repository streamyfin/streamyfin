import type React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";

interface TVSegmentBadgeProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

const TVSegmentBadge: React.FC<TVSegmentBadgeProps> = ({
  label,
  isSelected,
  onPress,
  hasTVPreferredFocus = false,
}) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ duration: 150 });

  // Design language: white for focused/selected, transparent white for unfocused
  const getBackgroundColor = () => {
    if (focused) return "#fff";
    if (isSelected) return "rgba(255,255,255,0.25)";
    return "rgba(255,255,255,0.1)";
  };

  const getTextColor = () => {
    if (focused) return "#000";
    return "#fff";
  };

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 24,
            backgroundColor: getBackgroundColor(),
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.4 : 0,
            shadowRadius: focused ? 12 : 0,
          },
        ]}
      >
        <Text
          style={{
            fontSize: typography.callout,
            color: getTextColor(),
            fontWeight: isSelected || focused ? "600" : "400",
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export interface TVSegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface TVSegmentedControlProps<T extends string> {
  options: TVSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** When true, the currently-selected badge receives initial TV focus. */
  hasTVPreferredFocus?: boolean;
}

/**
 * Focusable TV segmented control (design: white focus, blurred pill unfocused).
 * Generalized from the former TVFavoritesTabBadges so it can drive any
 * segmented swap on TV. Only the selected badge takes preferred focus.
 */
export function TVSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  hasTVPreferredFocus = false,
}: TVSegmentedControlProps<T>) {
  return (
    <View style={{ flexDirection: "row", gap: 16, marginBottom: 24 }}>
      {options.map((option) => (
        <TVSegmentBadge
          key={option.value}
          label={option.label}
          isSelected={value === option.value}
          onPress={() => onChange(option.value)}
          hasTVPreferredFocus={hasTVPreferredFocus && value === option.value}
        />
      ))}
    </View>
  );
}
