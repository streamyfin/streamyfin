import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { useStreamystatsEnabled } from "@/hooks/useWatchlists";

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
          headerShown: true,
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
          headerShown: true,
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
          headerShown: true,
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
