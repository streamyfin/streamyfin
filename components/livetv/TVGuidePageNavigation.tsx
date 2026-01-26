import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";

interface TVGuidePageNavigationProps {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
  prevButtonRefSetter?: (ref: View | null) => void;
}

interface NavButtonProps {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  isDisabled: boolean;
  disabled?: boolean;
  refSetter?: (ref: View | null) => void;
}

const NavButton: React.FC<NavButtonProps> = ({
  onPress,
  icon,
  label,
  isDisabled,
  disabled = false,
  refSetter,
}) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.05,
      duration: 120,
    });

  const visuallyDisabled = isDisabled || disabled;

  const handlePress = () => {
    if (!visuallyDisabled) {
      onPress();
    }
  };

  return (
    <Pressable
      ref={refSetter}
      onPress={handlePress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          styles.navButton,
          animatedStyle,
          {
            backgroundColor: focused ? "#FFFFFF" : "rgba(255, 255, 255, 0.1)",
            opacity: visuallyDisabled ? 0.3 : 1,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={focused ? "#000000" : "#FFFFFF"}
        />
        <Text
          style={[
            styles.navButtonText,
            {
              fontSize: typography.callout,
              color: focused ? "#000000" : "#FFFFFF",
            },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export const TVGuidePageNavigation: React.FC<TVGuidePageNavigationProps> = ({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  disabled = false,
  prevButtonRefSetter,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();

  return (
    <View style={styles.container}>
      <View style={styles.buttonsContainer}>
        <NavButton
          onPress={onPrevious}
          icon='chevron-back'
          label={t("live_tv.previous")}
          isDisabled={currentPage <= 1}
          disabled={disabled}
          refSetter={prevButtonRefSetter}
        />

        <NavButton
          onPress={onNext}
          icon='chevron-forward'
          label={t("live_tv.next")}
          isDisabled={currentPage >= totalPages}
          disabled={disabled}
        />
      </View>

      <Text style={[styles.pageText, { fontSize: typography.callout }]}>
        {t("live_tv.page_of", { current: currentPage, total: totalPages })}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  buttonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  navButtonText: {
    fontWeight: "600",
  },
  pageText: {
    color: "rgba(255, 255, 255, 0.6)",
  },
});
