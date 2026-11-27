import type { Settings } from "@/utils/atoms/settings";

/** Which touch gestures a player may act on. */
export interface PlayerGestures {
  horizontalSwipeSkip: boolean;
  brightnessSwipe: boolean;
  volumeSwipe: boolean;
  holdToSpeed: boolean;
  pinchToZoom: boolean;
  doubleTapToSeek: boolean;
}

type GestureSettings = Pick<
  Settings,
  | "enablePlayerGestures"
  | "enableHorizontalSwipeSkip"
  | "enableLeftSideBrightnessSwipe"
  | "enableRightSideVolumeSwipe"
  | "enableHoldToSpeed"
  | "enablePinchToZoom"
  | "enableDoubleTapToSeek"
>;

/** The gesture switches' defaults, also the settings' own defaults. */
export const GESTURE_DEFAULTS: GestureSettings = {
  enablePlayerGestures: true,
  enableHorizontalSwipeSkip: true,
  enableLeftSideBrightnessSwipe: true,
  enableRightSideVolumeSwipe: true,
  enableHoldToSpeed: true,
  enablePinchToZoom: true,
  enableDoubleTapToSeek: false,
};

/**
 * The gestures the JS and native players honor: each one's own switch, and
 * all of them off while the master switch is. Shared by both players so the
 * settings mean the same thing whichever one plays. A switch with no saved
 * value (a settings record from before it existed) takes its default.
 */
export const resolvePlayerGestures = (
  settings: Partial<GestureSettings>,
): PlayerGestures => {
  const on = (key: keyof GestureSettings) =>
    settings[key] ?? GESTURE_DEFAULTS[key];
  const enabled = on("enablePlayerGestures");
  return {
    horizontalSwipeSkip: enabled && on("enableHorizontalSwipeSkip"),
    brightnessSwipe: enabled && on("enableLeftSideBrightnessSwipe"),
    volumeSwipe: enabled && on("enableRightSideVolumeSwipe"),
    holdToSpeed: enabled && on("enableHoldToSpeed"),
    pinchToZoom: enabled && on("enablePinchToZoom"),
    doubleTapToSeek: enabled && on("enableDoubleTapToSeek"),
  };
};
