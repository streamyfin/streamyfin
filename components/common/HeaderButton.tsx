/**
 * Primitives for anything mounted in a native stack header.
 *
 * `headerLeft`/`headerRight` elements are not laid out by React Native — they
 * are handed to the platform as bar button custom views (iOS:
 * `UIBarButtonItem(customView:)`; Android: a `Gravity.START`/`Gravity.END`
 * child of the Toolbar). The platform already insets that view by the standard
 * 16pt/dp bar margin, so any padding *inside* it pushes the glyph off the
 * system grid. Screens used to compensate with per-screen `px-2`, `p-2`,
 * `pl-1.5`, `mr-4`… which is exactly why no two headers lined up.
 *
 * The rule here: header buttons carry no padding and no margins. The box is the
 * icon's em square, so the container edge *is* the glyph edge and the platform
 * margin is the only offset. `hitSlop` restores the touch target, and
 * `HeaderButtonGroup` owns the spacing between siblings.
 */

import type { PropsWithChildren } from "react";
import {
  Platform,
  type StyleProp,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { Pressable, type PressableProps } from "react-native-gesture-handler";

/**
 * Render every header icon at this size. Icon fonts share a common em square,
 * so equally-sized glyphs line up across icon sets (Feather, Ionicons, …).
 */
export const HEADER_ICON_SIZE = 24;

/** Matches UIKit's spacing between adjacent bar button items. */
const HEADER_BUTTON_GAP = 16;

/** Grows the icon box to the 44pt minimum touch target from Apple's HIG. */
const HEADER_HIT_SLOP = 10;

/**
 * Gap between a `headerLeft` button and the title on Android.
 *
 * React Navigation renders the Android title as a *sibling inside* the
 * headerLeft view, and react-native-screens clears the Toolbar's own
 * `contentInsetStartWithNavigation` when a left subview is present — so the gap
 * has to come from JS. iOS mounts the title in a separate centre view and needs
 * nothing.
 */
const ANDROID_TITLE_GAP = 16;

export interface HeaderButtonProps extends Omit<PressableProps, "style"> {
  /**
   * `"left"` adds the Android-only gap before the title. Defaults to
   * `"right"`, which needs no compensation on either platform.
   */
  placement?: "left" | "right";
  /**
   * Layout tweaks for buttons that hold more than one glyph. Do not add padding
   * or margins here — that is what knocks the button off the header grid.
   */
  style?: StyleProp<ViewStyle>;
}

export const HeaderButton: React.FC<PropsWithChildren<HeaderButtonProps>> = ({
  children,
  placement = "right",
  style,
  ...props
}) => (
  <Pressable
    hitSlop={HEADER_HIT_SLOP}
    style={[
      {
        height: HEADER_ICON_SIZE,
        // Icons stay square; text buttons ("Save", "Log out") grow past it.
        minWidth: HEADER_ICON_SIZE,
        alignItems: "center",
        justifyContent: "center",
        marginRight:
          placement === "left" && Platform.OS === "android"
            ? ANDROID_TITLE_GAP
            : 0,
      },
      style,
    ]}
    {...props}
  >
    {children}
  </Pressable>
);

/**
 * Spaces multiple header buttons evenly. Use this instead of putting margins on
 * the buttons themselves — a button that carries its own margin is misaligned
 * everywhere it is used without a sibling.
 */
export const HeaderButtonGroup: React.FC<PropsWithChildren<ViewProps>> = ({
  children,
  style,
  ...props
}) => (
  <View
    style={[
      {
        flexDirection: "row",
        alignItems: "center",
        gap: HEADER_BUTTON_GAP,
      },
      style,
    ]}
    {...props}
  >
    {children}
  </View>
);
