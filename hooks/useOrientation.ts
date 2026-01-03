import type { OrientationChangeEvent } from "expo-screen-orientation";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  addOrientationChangeListener,
  getOrientationAsync,
  lockAsync,
  Orientation as OrientationEnum,
  OrientationLock,
  unlockAsync,
} from "@/packages/expo-screen-orientation";
import { Orientation } from "../packages/expo-screen-orientation.tv";

const orientationToOrientationLock = (
  orientation: (typeof OrientationEnum)[keyof typeof OrientationEnum],
): (typeof OrientationLock)[keyof typeof OrientationLock] => {
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
    Platform.isTV ? OrientationLock.LANDSCAPE : OrientationLock.UNKNOWN,
  );

  useEffect(() => {
    if (Platform.isTV) return;

    const orientationSubscription = addOrientationChangeListener(
      (event: OrientationChangeEvent) => {
        setOrientation(
          orientationToOrientationLock(event.orientationInfo.orientation),
        );
      },
    );

    getOrientationAsync().then(
      (orientation: (typeof OrientationEnum)[keyof typeof OrientationEnum]) => {
        setOrientation(orientationToOrientationLock(orientation));
      },
    );

    return () => {
      orientationSubscription.remove();
    };
  }, []);

  const lockOrientation = useCallback(
    async (lock: (typeof OrientationLock)[keyof typeof OrientationLock]) => {
      if (Platform.isTV) return;

      if (lock === OrientationLock.DEFAULT) {
        await unlockAsync();
      } else {
        await lockAsync(lock);
      }
    },
    [],
  );

  const unlockOrientation = useCallback(async () => {
    if (Platform.isTV) return;
    await unlockAsync();
  }, []);

  return {
    orientation,
    setOrientation,
    lockOrientation,
    unlockOrientation,
  };
};
