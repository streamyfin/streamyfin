import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { useSettings } from "@/utils/atoms/settings";

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
  const { settings } = useSettings();
  const isTv = Platform.isTV;
  const isDisabled =
    isTv ||
    !Haptics ||
    settings?.disableHapticFeedback ||
    Platform.OS === "web";

  const createHapticHandler = useCallback(
    (type: typeof Haptics.ImpactFeedbackStyle) => {
      if (!Haptics || !type) return () => {};
      return () => Haptics.impactAsync(type);
    },
    [],
  );

  const createNotificationFeedback = useCallback(
    (type: typeof Haptics.NotificationFeedbackType) => {
      if (!Haptics || !type) return () => {};
      return () => Haptics.notificationAsync(type);
    },
    [],
  );

  const hapticHandlers = useMemo(() => {
    if (!Haptics) {
      return {
        light: () => {},
        medium: () => {},
        heavy: () => {},
        selection: () => {},
        success: () => {},
        warning: () => {},
        error: () => {},
      };
    }

    return {
      light: createHapticHandler(Haptics.ImpactFeedbackStyle.Light),
      medium: createHapticHandler(Haptics.ImpactFeedbackStyle.Medium),
      heavy: createHapticHandler(Haptics.ImpactFeedbackStyle.Heavy),
      selection: Haptics.selectionAsync,
      success: createNotificationFeedback(
        Haptics.NotificationFeedbackType.Success,
      ),
      warning: createNotificationFeedback(
        Haptics.NotificationFeedbackType.Warning,
      ),
      error: createNotificationFeedback(Haptics.NotificationFeedbackType.Error),
    };
  }, [createHapticHandler, createNotificationFeedback]);

  if (settings?.disableHapticFeedback) {
    return () => {};
  }
  return isDisabled ? () => {} : hapticHandlers[feedbackType];
};
