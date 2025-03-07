import { useSettings } from "@/utils/atoms/settings";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { useEffect } from "react";
import { Platform } from "react-native";

export const useOrientationSettings = () => {
  if (Platform.isTV) return;

  const [settings] = useSettings();

  useEffect(() => {
    if (settings?.followDeviceOrientation) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
    } else if (settings?.defaultVideoOrientation) {
      ScreenOrientation.lockAsync(settings.defaultVideoOrientation);
    }

    return () => {
      if (settings?.followDeviceOrientation) {
        ScreenOrientation.unlockAsync();
      } else {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };
  }, [settings]);
};
