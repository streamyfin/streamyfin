import {
  type ActionSheetProps,
  useActionSheet as useLibraryActionSheet,
} from "@expo/react-native-action-sheet";
import { useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * useActionSheet from @expo/react-native-action-sheet, kept above the Android
 * navigation bar: the library draws its own sheet there and ignores the safe
 * area. iOS shows the system sheet, which ignores containerStyle.
 */
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
