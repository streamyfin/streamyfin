import { I18nManager } from "react-native";

/**
 * `paddingLeft` and `paddingRight` that keep a sheet's sides clear of the
 * safe area insets, at least `minimum` each. The insets are physical, but
 * React Native swaps left and right styles in a right-to-left layout, so in
 * Arabic or Hebrew each side takes the other's inset and the bar's side still
 * gets it.
 */
export const sideInsetPadding = (
  insets: { left: number; right: number },
  minimum = 0,
) => {
  const [left, right] = I18nManager.isRTL
    ? [insets.right, insets.left]
    : [insets.left, insets.right];
  return {
    paddingLeft: Math.max(minimum, left),
    paddingRight: Math.max(minimum, right),
  };
};
