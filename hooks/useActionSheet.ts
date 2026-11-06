import {
  type ActionSheetProps,
  useActionSheet as useLibraryActionSheet,
} from "@expo/react-native-action-sheet";
import { useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The library's hook, padded above the Android navigation bar it ignores. */
export const useActionSheet = (): ActionSheetProps => {
  const { showActionSheetWithOptions } = useLibraryActionSheet();
  const { bottom } = useSafeAreaInsets();

  const show = useCallback<ActionSheetProps["showActionSheetWithOptions"]>(
    (options, callback) =>
      showActionSheetWithOptions(
        {
          ...options,
          containerStyle: { paddingBottom: bottom, ...options.containerStyle },
        },
        callback,
      ),
    [showActionSheetWithOptions, bottom],
  );

  return { showActionSheetWithOptions: show };
};
