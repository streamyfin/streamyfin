import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, Switch, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";

interface TVSaveAccountToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  hasTVPreferredFocus?: boolean;
}

export const TVSaveAccountToggle: React.FC<TVSaveAccountToggleProps> = ({
  value,
  onValueChange,
  label,
  hasTVPreferredFocus,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const animateFocus = (focused: boolean) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: focused ? 1.02 : 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: focused ? 0.6 : 0,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleFocus = () => {
    setIsFocused(true);
    animateFocus(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    animateFocus(false);
  };

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            shadowColor: "#a855f7",
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 16,
            elevation: 8,
          },
          { shadowOpacity: glowOpacity },
        ]}
      >
        <View
          style={{
            backgroundColor: isFocused ? "#2a2a2a" : "#1a1a1a",
            borderWidth: 2,
            borderColor: isFocused ? "#FFFFFF" : "transparent",
            borderRadius: 16,
            paddingHorizontal: 24,
            paddingVertical: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              color: "#FFFFFF",
            }}
          >
            {label}
          </Text>
          <View pointerEvents='none'>
            <Switch
              value={value}
              onValueChange={onValueChange}
              trackColor={{ false: "#3f3f46", true: Colors.primary }}
              thumbColor='white'
            />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};
