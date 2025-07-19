import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import orientationToOrientationLock from "@/utils/OrientationLockConverter";

export const useOrientation = () => {
  const [orientation, setOrientation] = useState(
    Platform.isTV
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.UNKNOWN,
  );

  useEffect(() => {
    if (Platform.isTV) return;

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
