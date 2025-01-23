import { Stack } from "expo-router";
import React from "react";
import { SystemBars } from "react-native-edge-to-edge";

export default function Layout() {
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
        <Stack.Screen
          name="transcoding-player"
          options={{
            headerShown: false,
            autoHideHomeIndicator: true,
            title: "",
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="music-player"
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
