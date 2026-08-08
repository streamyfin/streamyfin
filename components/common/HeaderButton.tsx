/**
 * Primitives for anything mounted in a native stack header.
 *
 * `headerLeft`/`headerRight` elements are not laid out by React Native — they
 * are handed to the platform as bar button custom views (iOS:
 * `UIBarButtonItem(customView:)`; Android: a `Gravity.START`/`Gravity.END`
 * child of the Toolbar). The platform positions that view against the bar
 * margin, and on iOS 26 it also draws the shared-background glass pill around
 * it. Both hug the content, so the element's own box is what sets the visual
 * inset. Screens used to set that inset ad hoc — `px-2` here, `p-2` there,
 * `pl-1.5`, `mr-4`, nothing at all — which is exactly why no two headers lined
 * up.
 *
 * The rule here: no margins anywhere, and one shared inset per side. Uniform is
 * what makes headers align; the value itself just has to be shared. The two
 * sides do not share the same value, though, and that is deliberate — see
 * `placement`. On the right the inset doubles as the pill's internal padding on
 * iOS 26, and two adjacent buttons produce `2 × HEADER_BUTTON_INSET` between
 * their glyphs, so the group needs no gap of its own.
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

/**
 * Horizontal inset carried by `headerRight` content.
 *
 * On iOS 26 this is the padding inside the shared-background pill — with zero
 * inset the glyphs sit hard against the glass edge. Between two adjacent
 * buttons it doubles to 16pt, which is UIKit's spacing for bar button items.
 * Anything mounted on the right that is not a `HeaderButton` (`RoundButton`'s
 * large variant, a dropdown trigger) must use the same value.
 *
 * `headerLeft` deliberately gets none — see `placement`.
 */
export const HEADER_BUTTON_INSET = 8;

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
   * Which side of the header this sits on. The two are not symmetric:
   *
   * `"left"` gets no horizontal inset, because its glyph has to line up with
   * the native back button's chevron on sibling screens, and that sits flush at
   * the bar margin. It does get the Android-only gap before the title.
   *
   * `"right"` (the default) gets `HEADER_BUTTON_INSET`. Nothing lines up
   * against the trailing edge, so there the pill is the visual object and wants
   * interior padding.
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
        paddingHorizontal: placement === "left" ? 0 : HEADER_BUTTON_INSET,
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
 * Lays header buttons out in a row. Spacing comes from each button's own
 * horizontal inset, not from a gap here — that way a lone button gets the same
 * inset inside the iOS 26 pill as one sitting in a group of five.
 */
export const HeaderButtonGroup: React.FC<PropsWithChildren<ViewProps>> = ({
  children,
  style,
  ...props
}) => (
  <View
    style={[{ flexDirection: "row", alignItems: "center" }, style]}
    {...props}
  >
    {children}
  </View>
);
