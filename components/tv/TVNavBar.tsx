import React from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { TVPadding } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVNavBarTab {
  key: string;
  label: string;
}

export interface TVNavBarProps {
  tabs: TVNavBarTab[];
  activeTabKey: string;
  onTabChange: (key: string) => void;
  style?: ViewStyleProp;
}

const TVNavBarTabItem: React.FC<{
  label: string;
  isActive: boolean;
  onSelect: () => void;
  onLayout: (e: {
    nativeEvent: { layout: { x: number; width: number } };
  }) => void;
  hasTVPreferredFocus: boolean;
}> = ({ label, isActive, onSelect, onLayout, hasTVPreferredFocus }) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.05,
      duration: 120,
    });

  const bg = focused
    ? "rgba(255, 255, 255, 0.95)"
    : isActive
      ? "rgba(255, 255, 255, 0.15)"
      : "transparent";

  const textColor = focused
    ? "#000"
    : isActive
      ? "#fff"
      : "rgba(255, 255, 255, 0.7)";

  return (
    <Pressable
      onPress={onSelect}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onLayout={onLayout}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: bg,
            borderRadius: scaleSize(24),
            borderWidth: isActive && !focused ? 1 : 0,
            borderColor: "rgba(255, 255, 255, 0.3)",
            paddingHorizontal: scaleSize(28),
            paddingVertical: scaleSize(14),
          },
        ]}
      >
        <Text
          style={{
            fontSize: typography.heading,
            color: textColor,
            fontWeight: isActive || focused ? "600" : "400",
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export const TVNavBar: React.FC<TVNavBarProps> = ({
  tabs,
  activeTabKey,
  onTabChange,
  style,
}) => {
  const scrollRef = React.useRef<ScrollView>(null);
  const tabLayouts = React.useRef<Record<string, { x: number; width: number }>>(
    {},
  );
  const insets = useSafeAreaInsets();

  const handleTabLayout = React.useCallback(
    (key: string) =>
      (e: { nativeEvent: { layout: { x: number; width: number } } }) => {
        tabLayouts.current[key] = e.nativeEvent.layout;
      },
    [],
  );

  const handleTabChange = React.useCallback(
    (key: string) => {
      onTabChange(key);

      const layout = tabLayouts.current[key];
      if (layout && scrollRef.current) {
        scrollRef.current.scrollTo({
          x: Math.max(0, layout.x - TVPadding.horizontal / 2),
          animated: true,
        });
      }
    },
    [onTabChange],
  );

  if (tabs.length === 0) return null;

  return (
    <View style={[{ paddingTop: insets.top + 16, paddingBottom: 8 }, style]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          gap: scaleSize(12),
        }}
      >
        {tabs.map((tab) => (
          <TVNavBarTabItem
            key={tab.key}
            label={tab.label}
            isActive={tab.key === activeTabKey}
            onSelect={() => handleTabChange(tab.key)}
            onLayout={handleTabLayout(tab.key)}
            hasTVPreferredFocus={tab.key === activeTabKey}
          />
        ))}
      </ScrollView>
    </View>
  );
};
