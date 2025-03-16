import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { useSettings } from "@/utils/atoms/settings";
import { Stack } from "expo-router";
import React, { useLayoutEffect } from "react";
import { Platform } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";

export default function Layout() {
  const [settings] = useSettings();

  useLayoutEffect(() => {
    if (Platform.isTV) return;

    if (!settings.followDeviceOrientation && settings.defaultVideoOrientation) {
      ScreenOrientation.lockAsync(settings.defaultVideoOrientation);
    }

    return () => {
      if (Platform.isTV) return;

      if (settings.followDeviceOrientation === true) {
        ScreenOrientation.unlockAsync();
      } else {
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      }
    };
  });

  return (
    <>
      <SystemBars hidden />
      <Stack>
        <Stack.Screen
          name='direct-player'
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
