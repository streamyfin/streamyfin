import { useSettings } from "@/utils/atoms/settings";
import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
const Haptics = !Platform.isTV ? require("expo-haptics") : null;

export type HapticFeedbackType =
  | "light"
  | "medium"
  | "heavy"
  | "selection"
  | "success"
  | "warning"
  | "error";

export const useHaptic = (feedbackType: HapticFeedbackType = "selection") => {
  const [settings] = useSettings();

  if (Platform.isTV) {
    return () => {};
  }

  const createHapticHandler = useCallback(
    (type: typeof Haptics.ImpactFeedbackStyle) => {
      return Platform.OS === "web" || Platform.isTV
        ? () => {}
        : () => Haptics.impactAsync(type);
    },
    [],
  );
  const createNotificationFeedback = useCallback(
    (type: typeof Haptics.NotificationFeedbackType) => {
      return Platform.OS === "web" || Platform.isTV
        ? () => {}
        : () => Haptics.notificationAsync(type);
    },
    [],
  );

  const hapticHandlers = useMemo(
    () => ({
      light: createHapticHandler(Haptics.ImpactFeedbackStyle.Light),
      medium: createHapticHandler(Haptics.ImpactFeedbackStyle.Medium),
      heavy: createHapticHandler(Haptics.ImpactFeedbackStyle.Heavy),
      selection:
        Platform.OS === "web" || Platform.isTV
          ? () => {}
          : Haptics.selectionAsync,
      success: createNotificationFeedback(
        Haptics.NotificationFeedbackType.Success,
      ),
      warning: createNotificationFeedback(
        Haptics.NotificationFeedbackType.Warning,
      ),
      error: createNotificationFeedback(Haptics.NotificationFeedbackType.Error),
    }),
    [createHapticHandler, createNotificationFeedback],
  );

  if (settings?.disableHapticFeedback) {
    return () => {};
  }
  return hapticHandlers[feedbackType];
};
