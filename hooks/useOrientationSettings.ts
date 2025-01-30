import { useSettings } from "@/utils/atoms/settings";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";

export const useOrientationSettings = () => {
  const [settings] = useSettings();

  useEffect(() => {
    const setOrientation = async () => {
      if (settings?.autoRotate) {
        const currentOrientation =
          await ScreenOrientation.getOrientationAsync();

        if (
          !(
            currentOrientation ===
              ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            currentOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
          )
        ) {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
          );
        }
      } else if (settings?.defaultVideoOrientation) {
        await ScreenOrientation.lockAsync(settings.defaultVideoOrientation);
      }
    };

    setOrientation();

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
