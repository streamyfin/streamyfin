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
};
