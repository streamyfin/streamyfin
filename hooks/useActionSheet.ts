import {
  type ActionSheetProps,
  useActionSheet as useLibraryActionSheet,
} from "@expo/react-native-action-sheet";
import { useCallback, useEffect } from "react";
import {
  type EdgeInsets,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { sideInsetPadding } from "@/utils/sideInsetPadding";

// The insets a sheet is padded with, read when it opens. One component keeps
// them: subscribed in the hook, every poster with an item menu rendered again
// each time the player hid or showed the system bars.
let currentInsets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Keeps the insets `useActionSheet` pads with. Rendered once, in the root
 * layout, under the safe area provider expo-router puts around it.
 */
export const ActionSheetInsets = () => {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    currentInsets = insets;
  }, [insets]);
  return null;
};

/**
 * The library's hook, padded clear of the Android navigation bar it ignores:
 * below the sheet, and on the bar's side in landscape.
 */
export const useActionSheet = (): ActionSheetProps => {
  const { showActionSheetWithOptions } = useLibraryActionSheet();

  const show = useCallback<ActionSheetProps["showActionSheetWithOptions"]>(
    (options, callback) =>
      showActionSheetWithOptions(
        {
          ...options,
          containerStyle: {
            paddingBottom: currentInsets.bottom,
            ...sideInsetPadding(currentInsets),
            ...options.containerStyle,
          },
        },
        callback,
      ),
    [showActionSheetWithOptions],
  );

  return { showActionSheetWithOptions: show };
};
