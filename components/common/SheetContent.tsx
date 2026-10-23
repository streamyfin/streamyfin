import { BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SHEET_PADDING, SHEET_PADDING_TOP } from "@/constants/Values";

/** Sheet content padding that keeps clear of the navigation bar. */
export const useSheetContentPadding = () => {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: SHEET_PADDING_TOP,
    paddingLeft: Math.max(SHEET_PADDING, insets.left),
    paddingRight: Math.max(SHEET_PADDING, insets.right),
    paddingBottom: insets.bottom + SHEET_PADDING,
  };
};

/** BottomSheetView with the sheet content padding. */
export const SheetView = ({
  style,
  ...props
}: ComponentProps<typeof BottomSheetView>) => {
  const padding = useSheetContentPadding();
  return <BottomSheetView style={[padding, style]} {...props} />;
};

/** BottomSheetScrollView with the sheet content padding. */
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
