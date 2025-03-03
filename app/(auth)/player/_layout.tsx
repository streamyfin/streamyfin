import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { SystemBars } from "react-native-edge-to-edge";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { useSettings } from "@/utils/atoms/settings";
import { Platform } from "react-native";

export default function Layout() {
  const [settings] = useSettings();

  useEffect(() => {
    if (Platform.isTV) return;

    if (settings.defaultVideoOrientation) {
      ScreenOrientation.lockAsync(settings.defaultVideoOrientation);
    }

    return () => {
      if (Platform.isTV) return;

      if (settings.autoRotate === true) {
        ScreenOrientation.unlockAsync();
      } else {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };
  }, [settings.defaultVideoOrientation, settings.autoRotate]);

  return (
    <>
      <SystemBars hidden />
      <Stack>
        <Stack.Screen
          name="direct-player"
          options={{
            headerShown: false,
            autoHideHomeIndicator: true,
            title: "",
            animation: "fade",
          }}
        />
      </Stack>
    </>
  );
}
