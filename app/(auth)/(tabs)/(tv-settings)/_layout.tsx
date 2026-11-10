import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/stacks/NestedTabPageStack";

// The Settings tab of the TV bar (utils/tvTabs.ts). TV settings open their
// options in modals, so the tab holds a single page.
export default function TVSettingsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name='index' options={{ headerShown: false }} />
    </Stack>
  );
}
