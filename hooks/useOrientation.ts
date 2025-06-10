import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import orientationToOrientationLock from "@/utils/OrientationLockConverter";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

export const useOrientation = () => {
  const [orientation, setOrientation] = useState(
    Platform.isTV
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.UNKNOWN,
  );

  if (Platform.isTV) return { orientation, setOrientation };

  useEffect(() => {
    const orientationSubscription =
      ScreenOrientation.addOrientationChangeListener((event) => {
        setOrientation(
          orientationToOrientationLock(event.orientationInfo.orientation),
        );
      });

    ScreenOrientation.getOrientationAsync().then((orientation) => {
      setOrientation(orientationToOrientationLock(orientation));
    });

    return () => {
      orientationSubscription.remove();
    };
  }, []);

  return { orientation, setOrientation };
};
