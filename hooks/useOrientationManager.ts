import { Accelerometer } from "expo-sensors";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";

type DeviceOrientation =
  | ScreenOrientation.OrientationLock.PORTRAIT_UP
  | ScreenOrientation.OrientationLock.LANDSCAPE_LEFT
  | ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT;

export const useOrientationManager = () => {
  const [devicePhysicalOrientation, setDevicePhysicalOrientation] =
    useState<DeviceOrientation>(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const accelerometerSubscription = useRef<any>(null);

  // Use accelerometer to detect physical device orientation
  const startAccelerometer = useCallback(() => {
    if (Platform.isTV || accelerometerSubscription.current) return;

    Accelerometer.setUpdateInterval(500);

    accelerometerSubscription.current = Accelerometer.addListener((data) => {
      const { x, y } = data;

      // Determine orientation based on gravity vector
      // x: left/right tilt, y: forward/back tilt
      const threshold = 0.5;

      if (Math.abs(x) > Math.abs(y)) {
        if (x > threshold) {
          // Device tilted right (landscape right)
          setDevicePhysicalOrientation(
            ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
          );
        } else if (x < -threshold) {
          // Device tilted left (landscape left)
          setDevicePhysicalOrientation(
            ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
          );
        }
      } else {
        // Portrait orientation
        setDevicePhysicalOrientation(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      }
    });
  }, []);

  const stopAccelerometer = useCallback(() => {
    if (accelerometerSubscription.current) {
      accelerometerSubscription.current.remove();
      accelerometerSubscription.current = null;
    }
  }, []);

  const lockOrientation = useCallback(
    async (orientation: ScreenOrientation.OrientationLock) => {
      if (Platform.isTV) return;

      try {
        await ScreenOrientation.lockAsync(orientation);
      } catch (error) {
        console.error("Failed to lock orientation:", error);
      }
    },
    [],
  );

  const unlockOrientation = useCallback(async () => {
    if (Platform.isTV) return;

    try {
      await ScreenOrientation.unlockAsync();
    } catch (error) {
      console.error("Failed to unlock orientation:", error);
    }
  }, []);

  const getDevicePhysicalOrientation =
    useCallback(async (): Promise<DeviceOrientation> => {
      // Start accelerometer temporarily to get current physical orientation
      if (!accelerometerSubscription.current) {
        startAccelerometer();
        // Wait a bit for the sensor to provide data
        await new Promise((resolve) => setTimeout(resolve, 600));
        stopAccelerometer();
      }
      return devicePhysicalOrientation;
    }, [devicePhysicalOrientation, startAccelerometer, stopAccelerometer]);

  return {
    devicePhysicalOrientation,
    lockOrientation,
    unlockOrientation,
    getDevicePhysicalOrientation,
    startAccelerometer,
    stopAccelerometer,
  };
};
