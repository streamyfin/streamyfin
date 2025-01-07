import { useSettings } from "@/utils/atoms/settings";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";

export const useOrientationSettings = () => {
  const [settings] = useSettings();

  useEffect(() => {
    if (settings?.autoRotate) {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
      );
    } else if (settings?.defaultVideoOrientation) {
      ScreenOrientation.lockAsync(settings.defaultVideoOrientation);
    }

    return () => {
      if (settings?.autoRotate) {
        ScreenOrientation.unlockAsync();
      } else {
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      }
    };
  }, [settings]);
};
