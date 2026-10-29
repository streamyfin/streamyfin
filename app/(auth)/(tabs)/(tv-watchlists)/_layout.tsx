import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  nestedTabPageScreenOptions,
  stackScreenOptions,
  watchlistSheetScreenOptions,
} from "@/components/stacks/NestedTabPageStack";

// The Watchlists tab of the TV bar (utils/tvTabs.ts). A watchlist and the
// items in it come from the shared group and stay in this tab.
export default function TVWatchlistsLayout() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name='index' options={{ headerShown: false }} />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
      {Object.entries(watchlistSheetScreenOptions(t)).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
