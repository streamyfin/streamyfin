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
 * The rule here: no margins anywhere, and all spacing owned by
 * `HeaderButtonGroup` — the end insets and the gap between neighbours. Buttons
 * themselves sit flush, with one exception: a lone text button opts back into
 * the inset via `variant="text"`, because bare letters against the pill's glass
 * edge read as a bug where a bare glyph does not.
 */

import { Children, type PropsWithChildren } from "react";
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
 * End padding inside a `HeaderButtonGroup`, and inside a lone `variant="text"`
 * button.
 *
 * On iOS 26 the pill hugs whichever of those it wraps, and with zero inset the
 * content sits hard against the glass edge. A lone icon is the one case that
 * gets none of this: a glyph carries whitespace inside its em square, and
 * padding a pill drawn around a single glyph just makes it wide for no reason.
 */
const HEADER_INSET = 8;

/** UIKit's spacing between adjacent bar button items. */
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
   * `"text"` restores the end inset for buttons that hold a label ("Save",
   * "Log out") rather than a glyph — text runs to the edge of its box, so with
   * zero inset the iOS 26 pill hugs the letters. Only a lone button needs it;
   * inside a `HeaderButtonGroup` the group's end padding already covers both
   * ends. Defaults to `"icon"`, which sits flush.
   */
  variant?: "icon" | "text";
  /**
   * Layout tweaks for buttons that hold more than one glyph. Do not add padding
   * or margins here — that is what knocks the button off the header grid.
   */
  style?: StyleProp<ViewStyle>;
}

export const HeaderButton: React.FC<PropsWithChildren<HeaderButtonProps>> = ({
  children,
  placement = "right",
  variant = "icon",
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
        paddingHorizontal: variant === "text" ? HEADER_INSET : 0,
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
 * Lays out header buttons in a row and owns all of their spacing: the gap
 * between them and the padding at each end of the iOS 26 pill. Buttons carry
 * none of it themselves, so a lone one — the `+` on watchlists, the library
 * filter — sits flush with no wrapper needed.
 *
 * The end padding drops away when only one child survives, since a pill drawn
 * around a single glyph has nothing to pad. That matters because most of these
 * groups are conditional (no sessions button for non-admins, no download row
 * for a Live TV programme), so "how many buttons" is a render-time answer.
 *
 * `Children.toArray` discards the `false` a short-circuited child renders, but
 * counts a fragment as one — so keep buttons as direct children rather than
 * grouping several inside a single fragment.
 */
export const HeaderButtonGroup: React.FC<PropsWithChildren<ViewProps>> = ({
  children,
  style,
  ...props
}) => {
  const isAlone = Children.toArray(children).length < 2;

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: HEADER_BUTTON_GAP,
          paddingHorizontal: isAlone ? 0 : HEADER_INSET,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};
