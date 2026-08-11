import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import {
  HeaderButton,
  HeaderButtonGroup,
} from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import {
  nestedTabPageScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";

const Chromecast = Platform.isTV ? null : require("@/components/Chromecast");

import { useAtom } from "jotai";
import { useSessions, type useSessionsProps } from "@/hooks/useSessions";
import { userAtom } from "@/providers/JellyfinProvider";

// Keeps cold boot on the Home tab.
//
// Every tab group holds an `index` route, so all of them match the launch URL
// `/` equally well — a bare launch has no deep link, so Expo Router resolves
// `/`. It breaks that tie by first preferring a route that is its own group's
// anchor (`isInitial` in the getStateFromPath config sorter), and only then by
// group order, which is alphabetical because Metro sorts the `require.context`
// keys. When #1928 gave `(libraries)` and `(watchlists)` an `anchor` for their
// deep-entry back button, it also promoted them above the unanchored `(home)`,
// and `(libraries)` won that pair alphabetically — so the app booted into the
// library. Anchoring `(home)` puts it back in the running, ahead of
// `(libraries)`.
//
// So: do NOT add `anchor` to a tab group that sorts before `(home)` —
// `(custom-links)` or `(favorites)` — or the app boots into that tab instead.
// An `anchor` on the `(tabs)` layout itself does not help: it only seeds the
// tab underneath whichever tab the URL resolved to.
//
// The anchor is right on its own merits too: a deep link into a home sub-page
// (`/(auth)/(tabs)/(home)/settings`) now seeds the home list underneath, so
// the native stack renders a back button — the same reasoning as the comments
// in the `(libraries)` and `(watchlists)` layouts.
export const unstable_settings = { anchor: "index" };

export default function IndexLayout() {
  const [user] = useAtom(userAtom);
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
          headerRight: () =>
            Platform.isTV ? null : (
              <HeaderButtonGroup>
                <Chromecast.Chromecast />
                {user?.Policy?.IsAdministrator && <SessionsButton />}
                <SettingsButton />
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
      <Stack.Screen
        name='sessions/index'
        options={{
          title: t("home.sessions.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings'
        options={{
          title: t("home.settings.settings_title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='companion-login'
        options={{
          title: t("companion_login.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/playback-controls/page'
        options={{
          title: t("home.settings.playback_controls.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/audio-subtitles/page'
        options={{
          title: t("home.settings.audio_subtitles.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/appearance/page'
        options={{
          title: t("home.settings.appearance.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/music/page'
        options={{
          title: t("home.settings.music.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/appearance/hide-libraries/page'
        options={{
          title: t("home.settings.other.hide_libraries"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/plugins/page'
        options={{
          title: t("home.settings.plugins.plugins_title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/plugins/marlin-search/page'
        options={{
          title: "Marlin Search",
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/plugins/jellyseerr/page'
        options={{
          title: "Jellyseerr",
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/plugins/streamystats/page'
        options={{
          title: "Streamystats",
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/plugins/kefinTweaks/page'
        options={{
          title: "KefinTweaks",
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/intro/page'
        options={{
          title: t("home.settings.intro.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/logs/page'
        options={{
          title: t("home.settings.logs.logs_title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='settings/network/page'
        options={{
          title: t("home.settings.network.title"),
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
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

const SettingsButton = () => {
  const router = useRouter();

  return (
    <HeaderButton onPress={() => router.push("/(auth)/settings")}>
      <HeaderIcon name='settings' />
    </HeaderButton>
  );
};

const SessionsButton = () => {
  const router = useRouter();
  const { sessions = [] } = useSessions({} as useSessionsProps);

  return (
    <HeaderButton onPress={() => router.push("/(auth)/sessions")}>
      <HeaderIcon
        name='sessions'
        tintColor={sessions.length === 0 ? "white" : Colors.primary}
      />
    </HeaderButton>
  );
};
