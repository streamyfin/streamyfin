import type { ComponentProps } from "react";
import { Platform } from "react-native";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds, and
// requiring it at load crashes the route tree there. Load it lazily, off TV.
const { Menu } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");

// UIMenu orders items by distance to the anchor, so a menu that opens upward
// lists them backwards. Built once, and only where SwiftUI menus render.
const fixedOrder =
  Platform.OS === "ios" && !Platform.isTV
    ? [require("@expo/ui/swift-ui/modifiers").menuOrder("fixed")]
    : [];

type MenuProps = ComponentProps<typeof import("@expo/ui/swift-ui").Menu>;

/**
 * The SwiftUI `Menu` from @expo/ui with its items kept in the order they are
 * given. Every SwiftUI menu in the app goes through this one, so the order
 * cannot be lost menu by menu again.
 */
export const FixedOrderMenu = ({ modifiers, ...props }: MenuProps) => (
  <Menu {...props} modifiers={[...fixedOrder, ...(modifiers ?? [])]} />
);
