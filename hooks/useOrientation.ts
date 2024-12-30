import orientationToOrientationLock from "@/utils/OrientationLockConverter";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";

export const useOrientation = () => {
  const [orientation, setOrientation] = useState(
    ScreenOrientation.OrientationLock.UNKNOWN
  );

  useEffect(() => {
    const orientationSubscription =
      ScreenOrientation.addOrientationChangeListener((event) => {
        setOrientation(
          orientationToOrientationLock(event.orientationInfo.orientation)
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
