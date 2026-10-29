import { Stack } from "expo-router";
import {
  commonScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";

// The Live TV tab of the TV bar (utils/tvTabs.ts). A phone opens Live TV from More.
export default function TVLiveTVLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name='index' options={{ headerShown: false }} />
      <Stack.Screen name='items/page' options={commonScreenOptions} />
    </Stack>
  );
}
