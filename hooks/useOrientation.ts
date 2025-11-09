import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { OrientationLock } from "@/packages/expo-screen-orientation";
import { Orientation } from "../packages/expo-screen-orientation.tv";

const orientationToOrientationLock = (
  orientation: Orientation,
): OrientationLock => {
  switch (orientation) {
    case Orientation.LANDSCAPE_LEFT:
      return OrientationLock.LANDSCAPE_LEFT;
    case Orientation.LANDSCAPE_RIGHT:
      return OrientationLock.LANDSCAPE_RIGHT;
    case Orientation.PORTRAIT_UP:
      return OrientationLock.PORTRAIT_UP;
    default:
      return OrientationLock.PORTRAIT_UP;
  }
};

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

  const lockOrientation = async (lock: OrientationLock) => {
    if (Platform.isTV) return;

    if (lock === ScreenOrientation.OrientationLock.DEFAULT) {
      await ScreenOrientation.unlockAsync();
    } else {
      await ScreenOrientation.lockAsync(lock);
    }
  };

  const unlockOrientation = async () => {
    if (Platform.isTV) return;
    await ScreenOrientation.unlockAsync();
  };

  return { orientation, setOrientation, lockOrientation, unlockOrientation };
};
