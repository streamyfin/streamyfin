import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";

type ViewType = "Favorites" | "Watchlist";

interface TVFavoritesTabBadgeProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

const TVFavoritesTabBadge: React.FC<TVFavoritesTabBadgeProps> = ({
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

export interface TVFavoritesTabBadgesProps {
  viewType: ViewType;
  setViewType: (type: ViewType) => void;
  /** Only render the toggle when the KefinTweaks watchlist is enabled. */
  enabled: boolean;
  hasTVPreferredFocus?: boolean;
}

export const TVFavoritesTabBadges: React.FC<TVFavoritesTabBadgesProps> = ({
  viewType,
  setViewType,
  enabled,
  hasTVPreferredFocus = false,
}) => {
  const { t } = useTranslation();

  if (!enabled) {
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
      <TVFavoritesTabBadge
        label={t("tabs.favorites")}
        isSelected={viewType === "Favorites"}
        onPress={() => setViewType("Favorites")}
        hasTVPreferredFocus={hasTVPreferredFocus && viewType === "Favorites"}
      />
      <TVFavoritesTabBadge
        label={t("favorites.watchlist")}
        isSelected={viewType === "Watchlist"}
        onPress={() => setViewType("Watchlist")}
        hasTVPreferredFocus={hasTVPreferredFocus && viewType === "Watchlist"}
      />
    </View>
  );
};
