import { View } from "react-native";

const pan = {
  activeOffsetY: () => pan,
  onUpdate: () => pan,
  onEnd: () => pan,
};

/** `react-native-gesture-handler`, with a pan gesture that never fires. */
export const gestureHandlerModule = {
  GestureDetector: ({ children }: { children: unknown }) => children,
  Gesture: {
    Pan: () => pan,
  },
  Pressable: View,
  // RoundButton presses through the legacy component since gesture handler 3.
  LegacyPressable: View,
};
