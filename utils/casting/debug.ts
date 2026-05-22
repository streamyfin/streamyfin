/**
 * Developer flag for visualising touch zones in the casting player.
 *
 * Flip to `true` to draw outlines over the slider hit area and the control row,
 * run the app, hand-calibrate `panHitSlop`, then flip back to `false`.
 * Every use is gated with `__DEV__` so it can never render in a release build.
 */
export const DEBUG_TOUCH_ZONES = false;
