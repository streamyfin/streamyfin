import React from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { TVTypography } from "@/constants/TVTypography";

interface ToggleItem {
  id: number;
  label: string;
  selected: boolean;
}

interface TVToggleChipProps {
  item: ToggleItem;
  onToggle: (id: number) => void;
  disabled?: boolean;
}

const TVToggleChip: React.FC<TVToggleChipProps> = ({
  item,
  onToggle,
  disabled = false,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.08,
    });

  return (
    <Pressable
      onPress={() => onToggle(item.id)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            paddingVertical: 10,
            paddingHorizontal: 16,
            backgroundColor: focused
              ? "#fff"
              : item.selected
                ? "rgba(255,255,255,0.25)"
                : "rgba(255,255,255,0.1)",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: focused
              ? "#fff"
              : item.selected
                ? "rgba(255,255,255,0.4)"
                : "rgba(255,255,255,0.15)",
          },
        ]}
      >
        <Text
          style={{
            fontSize: TVTypography.callout,
            color: focused ? "#000" : "#fff",
            fontWeight: item.selected || focused ? "600" : "400",
          }}
        >
          {item.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

interface TVToggleOptionRowProps {
  label: string;
  items: ToggleItem[];
  onToggle: (id: number) => void;
  disabled?: boolean;
}

export const TVToggleOptionRow: React.FC<TVToggleOptionRowProps> = ({
  label,
  items,
  onToggle,
  disabled = false,
}) => {
  if (items.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: TVTypography.callout,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 10,
        }}
      >
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ overflow: "visible" }}
        contentContainerStyle={{ gap: 10, paddingVertical: 12 }}
      >
        {items.map((item) => (
          <TVToggleChip
            key={item.id}
            item={item}
            onToggle={onToggle}
            disabled={disabled}
          />
        ))}
      </ScrollView>
    </View>
  );
};
