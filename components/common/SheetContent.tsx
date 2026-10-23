import { BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SHEET_PADDING, SHEET_PADDING_TOP } from "@/constants/Values";

/**
 * Padding for the content of a bottom sheet. The app draws edge to edge, so a
 * sheet reaches under the Android navigation bar and the iOS home indicator.
 */
export const useSheetContentPadding = () => {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: SHEET_PADDING_TOP,
    paddingLeft: Math.max(SHEET_PADDING, insets.left),
    paddingRight: Math.max(SHEET_PADDING, insets.right),
    paddingBottom: insets.bottom + SHEET_PADDING,
  };
};

export const SheetView = ({
  style,
  ...props
}: ComponentProps<typeof BottomSheetView>) => {
  const padding = useSheetContentPadding();
  return <BottomSheetView style={[padding, style]} {...props} />;
};

export const SheetScrollView = ({
  contentContainerStyle,
  ...props
}: ComponentProps<typeof BottomSheetScrollView>) => {
  const padding = useSheetContentPadding();
  return (
    <BottomSheetScrollView
      contentContainerStyle={[padding, contentContainerStyle]}
      {...props}
    />
  );
};
