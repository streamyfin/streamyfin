import { useEffect, useState } from "react";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import orientationToOrientationLock from "@/utils/OrientationLockConverter";

export const useOrientation = () => {
  const [orientation, setOrientation] = useState(
    ScreenOrientation.OrientationLock.UNKNOWN,
  );

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
