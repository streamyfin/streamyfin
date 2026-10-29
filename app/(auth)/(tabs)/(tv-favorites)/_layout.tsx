import { Stack } from "expo-router";
import {
  nestedTabPageScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";

// The Favorites tab of the TV bar (utils/tvTabs.ts). The pages it opens, such
// as an item, come from the shared group and stay in this tab.
export default function TVFavoritesLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name='index' options={{ headerShown: false }} />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
