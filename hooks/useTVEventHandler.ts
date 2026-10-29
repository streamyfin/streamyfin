import type { TVRemoteEvent } from "react-native";
import { Platform } from "react-native";

/**
 * A TV remote event. react-native-tvos 0.88 types `eventKeyAction` as a
 * string, but both platforms send a number: -1 unknown, 0 down, 1 up
 * (RCTTVNavigationEventNotificationConstants.mm on tvOS,
 * ReactAndroidHWInputDeviceHelper on Android).
 */
export type TVRemoteKeyEvent = Omit<TVRemoteEvent, "eventKeyAction"> & {
  eventKeyAction?: number;
};

type UseTVEventHandler = (callback: (evt: TVRemoteKeyEvent) => void) => void;

let tvEventHandler: UseTVEventHandler = () => {};

if (Platform.isTV) {
  try {
    tvEventHandler = require("react-native")
      .useTVEventHandler as UseTVEventHandler;
  } catch {
    tvEventHandler = () => {};
  }
}

export const useTVEventHandler = tvEventHandler;
