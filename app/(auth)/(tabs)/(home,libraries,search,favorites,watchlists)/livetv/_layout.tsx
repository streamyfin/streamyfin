import { Slot, Stack } from "expo-router";
import { Platform } from "react-native";

export default function LiveTVLayout() {
  // On TV, TVLiveTVPage handles its own tab navigation
  if (Platform.isTV) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Slot />
      </>
    );
  }

  return <Slot />;
}
