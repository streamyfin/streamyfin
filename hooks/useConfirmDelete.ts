import { useActionSheet } from "@expo/react-native-action-sheet";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform } from "react-native";

interface ConfirmDeleteOptions {
  /** Heading for the prompt, usually the name of what is being deleted. */
  title?: string;
  /** Supporting copy explaining what the delete removes. */
  message?: string;
  /** Label for the destructive button. Defaults to `common.delete`. */
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * Single entry point for "are you sure?" prompts on destructive actions, so
 * every delete in the app gets the same buttons in the same order.
 *
 * Mobile gets a native action sheet, TV an Alert - action sheets can't be
 * navigated with a remote. Feedback on the result (haptics, toasts) is left
 * to the caller, which is the only one that knows whether the delete worked.
 */
export const useConfirmDelete = () => {
  const { t } = useTranslation();
  const { showActionSheetWithOptions } = useActionSheet();

  return useCallback(
    ({ title, message, confirmLabel, onConfirm }: ConfirmDeleteOptions) => {
      const confirmText = confirmLabel ?? t("common.delete");
      const cancelText = t("common.cancel");

      if (Platform.isTV) {
        Alert.alert(title ?? confirmText, message, [
          { text: cancelText, style: "cancel" },
          { text: confirmText, style: "destructive", onPress: onConfirm },
        ]);
        return;
      }

      showActionSheetWithOptions(
        {
          title,
          message,
          options: [confirmText, cancelText],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (selectedIndex) => {
          if (selectedIndex === 0) onConfirm();
        },
      );
    },
    [t, showActionSheetWithOptions],
  );
};
