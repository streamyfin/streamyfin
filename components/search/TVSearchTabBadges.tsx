import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";

type SearchType = "Library" | "Discover";

interface TVSearchTabBadgeProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

const TVSearchTabBadge: React.FC<TVSearchTabBadgeProps> = ({
  label,
  isSelected,
  onPress,
  hasTVPreferredFocus = false,
  disabled = false,
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
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
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

export interface TVSearchTabBadgesProps {
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  showDiscover: boolean;
  disabled?: boolean;
}

export const TVSearchTabBadges: React.FC<TVSearchTabBadgesProps> = ({
  searchType,
  setSearchType,
  showDiscover,
  disabled = false,
}) => {
  if (!showDiscover) {
    return null;
  }

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <TVSearchTabBadge
        label='Library'
        isSelected={searchType === "Library"}
        onPress={() => setSearchType("Library")}
        disabled={disabled}
      />
      <TVSearchTabBadge
        label='Discover'
        isSelected={searchType === "Discover"}
        onPress={() => setSearchType("Discover")}
        disabled={disabled}
      />
    </View>
  );
};
