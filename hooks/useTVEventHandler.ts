import type { HWEvent } from "react-native";
import { Platform } from "react-native";

type UseTVEventHandler = (callback: (evt: HWEvent) => void) => void;

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
