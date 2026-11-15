import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { HeaderButtonGroup } from "@/components/common/HeaderButton";
import {
  nestedTabPageScreenOptions,
  stackScreenOptions,
  watchlistSheetScreenOptions,
} from "@/components/stacks/NestedTabPageStack";
import { SyncPlayButton } from "@/components/syncplay/SyncPlayButton";

const Chromecast = Platform.isTV ? null : require("@/components/Chromecast");

// Keeps cold boot on the Home tab.
//
// Every tab group holds an `index` route, so all of them match the launch URL
// `/` equally well — a bare launch has no deep link, so Expo Router resolves
// `/`. It breaks that tie by first preferring a route that is its own group's
// anchor (`isInitial` in the getStateFromPath config sorter), and only then by
// group order, which is alphabetical because Metro sorts the `require.context`
// keys. When #1928 gave `(libraries)` an `anchor` for its deep-entry back
// button, it also promoted it above the unanchored `(home)`, and `(libraries)`
// won that pair alphabetically — so the app booted into the library. Anchoring
// `(home)` puts it back in the running, ahead of `(libraries)` and `(more)`.
//
// So: do NOT add `anchor` to a tab group that sorts before `(home)`, or the app
// boots into that tab instead. An `anchor` on the `(tabs)` layout itself does
// not help: it only seeds the tab underneath whichever tab the URL resolved to.
//
// The anchor is right on its own merits too: a deep link into a home sub-page
// (`/(auth)/(tabs)/(home)/downloads`) seeds the home list underneath, so the
// native stack renders a back button — the same reasoning as the comments in
// the `(libraries)` and `(more)` layouts.
export const unstable_settings = { anchor: "index" };

export default function IndexLayout() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("tabs.home"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          // Sessions and Settings are in the More tab; the header keeps what
          // is used while watching.
          headerRight: () =>
            Platform.isTV ? null : (
              <HeaderButtonGroup>
                <Chromecast.Chromecast />
                <SyncPlayButton />
              </HeaderButtonGroup>
            ),
        }}
      />
      <Stack.Screen
        name='downloads/index'
        options={{
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          title: t("home.downloads.downloads_title"),
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
      {Object.entries(watchlistSheetScreenOptions(t)).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
      <Stack.Screen
        name='collections/[collectionId]'
        options={{
          title: "",
          headerShown: !Platform.isTV,
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
