import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TV_TOP_TAB_BAR_CLEARANCE } from "@/constants/Values";

/**
 * The part of a TV page below the top tab bar. The bar has no background, so a
 * page that scrolled its text under it showed the text through the tab labels;
 * inside this area, what scrolls up is cut off where the bar ends.
 */
export function TVBelowTabBar({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID='tv-below-tab-bar'
      style={{
        flex: 1,
        marginTop: insets.top + TV_TOP_TAB_BAR_CLEARANCE,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}
