import type { PropsWithChildren } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TV_TOP_TAB_BAR_CLEARANCE } from "@/constants/TVSizes";

// Only Android TV draws its tabs as a JS bar over the page. Apple TV's tab bar
// is native and opaque, and the page scrolls under it as it always has.
const tabBarOverPage = () => Platform.OS === "android";

/**
 * The part of a TV page below the top tab bar. On Android TV the bar has no
 * background, so a page that scrolled its text under it showed the text through
 * the tab labels; inside this area, what scrolls up is cut off where the bar
 * ends. On Apple TV it is a plain full-height area.
 */
export function TVBelowTabBar({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID='tv-below-tab-bar'
      style={
        tabBarOverPage()
          ? {
              flex: 1,
              marginTop: insets.top + TV_TOP_TAB_BAR_CLEARANCE,
              overflow: "hidden",
            }
          : { flex: 1 }
      }
    >
      {children}
    </View>
  );
}

/**
 * Where content inside TVBelowTabBar starts so that it rests `top` points
 * below the top of the screen, safe area included, on either TV. On Android TV
 * the area itself starts where the tab bar ends: a `top` above that rests at
 * the area's top.
 */
export function useTVBelowTabBarContentTop(top: number): number {
  const insets = useSafeAreaInsets();
  return tabBarOverPage()
    ? Math.max(0, top - TV_TOP_TAB_BAR_CLEARANCE)
    : insets.top + top;
}
