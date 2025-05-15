import { useCallback, useEffect, useRef, useState } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";

export const useControlsVisibility = (timeout = 3000) => {
  const opacity = useSharedValue(1);

  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showControls = useCallback(() => {
    opacity.value = 1;
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    hideControlsTimerRef.current = setTimeout(() => {
      opacity.value = 0;
    }, timeout);
  }, [timeout]);

  const hideControls = useCallback(() => {
    opacity.value = 0;
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, []);

  return { opacity, showControls, hideControls };
};
