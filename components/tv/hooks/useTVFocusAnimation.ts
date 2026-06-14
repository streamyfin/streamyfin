import { useCallback, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { useInactivity } from "@/providers/InactivityProvider";

export interface UseTVFocusAnimationOptions {
  scaleAmount?: number;
  duration?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface UseTVFocusAnimationReturn {
  focused: boolean;
  scale: Animated.Value;
  handleFocus: () => void;
  handleBlur: () => void;
  animatedStyle: { transform: { scale: Animated.Value }[] };
}

export const useTVFocusAnimation = ({
  scaleAmount = 1.05,
  duration = 150,
  onFocus,
  onBlur,
}: UseTVFocusAnimationOptions = {}): UseTVFocusAnimationReturn => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const { resetInactivityTimer } = useInactivity();

  const animateTo = useCallback(
    (value: number) => {
      Animated.timing(scale, {
        toValue: value,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [scale, duration],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    animateTo(scaleAmount);
    resetInactivityTimer();
    onFocus?.();
  }, [animateTo, scaleAmount, resetInactivityTimer, onFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    animateTo(1);
    onBlur?.();
  }, [animateTo, onBlur]);

  const animatedStyle = { transform: [{ scale }] };

  return {
    focused,
    scale,
    handleFocus,
    handleBlur,
    animatedStyle,
  };
};
