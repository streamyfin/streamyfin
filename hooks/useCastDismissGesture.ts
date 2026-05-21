import type { Router } from "expo-router";
import { useCallback } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface UseCastDismissGestureParams {
  router: Router;
}

/**
 * Swipe-down-to-dismiss gesture cluster for the casting player modal.
 * Owns the `translateY`/`context` shared values, the pan gesture, the animated
 * style, and the `dismissModal` callback (also invoked by the header button).
 */
export function useCastDismissGesture({ router }: UseCastDismissGestureParams) {
  // Swipe down to dismiss gesture
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });

  const dismissModal = useCallback(() => {
    // Navigate immediately without animation to prevent crashes
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/(tabs)/(home)/");
    }
  }, [router]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      // Only allow downward swipes from top of screen
      if (event.translationY > 0) {
        translateY.value = context.value.y + event.translationY;
      }
    })
    .onEnd((event) => {
      // Dismiss if swiped down more than 150px or fast swipe
      if (event.translationY > 150 || event.velocityY > 600) {
        // Animate down and dismiss
        translateY.value = withSpring(
          1000,
          {
            damping: 20,
            stiffness: 90,
          },
          () => {
            runOnJS(dismissModal)();
          },
        );
      } else {
        // Spring back to position
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return { panGesture, animatedStyle, dismissModal };
}
