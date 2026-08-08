import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import useRouter from "@/hooks/useAppRouter";
import { useStreamystatsEnabled } from "@/hooks/useWatchlists";

// The promoted-watchlists "See all" on the home page pushes a fully qualified
// `(watchlists)` path from the home tab, which would otherwise build this tab's
// stack as just [detail] — no back button, and the tab pinned to that watchlist.
// Same reasoning as the `(libraries)` layout; see the comment there.
export const unstable_settings = Platform.isTV ? {} : { anchor: "index" };

export default function WatchlistsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const streamystatsEnabled = useStreamystatsEnabled();

  return (
    <Stack>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("watchlists.title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerRight: streamystatsEnabled
            ? () => (
                <Pressable
                  onPress={() =>
                    router.push("/(auth)/(tabs)/(watchlists)/create")
                  }
                  className='p-1.5'
                >
                  <Ionicons name='add' size={24} color='white' />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.Screen
        name='[watchlistId]'
        options={{
          title: "",
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='create'
        options={{
          title: t("watchlists.create_title"),
          presentation: "modal",
          headerShown: !Platform.isTV,
          headerStyle: { backgroundColor: "#171717" },
          headerTintColor: "white",
          contentStyle: { backgroundColor: "#171717" },
        }}
      />
      <Stack.Screen
        name='edit/[watchlistId]'
        options={{
          title: t("watchlists.edit_title"),
          presentation: "modal",
          headerShown: !Platform.isTV,
          headerStyle: { backgroundColor: "#171717" },
          headerTintColor: "white",
          contentStyle: { backgroundColor: "#171717" },
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
