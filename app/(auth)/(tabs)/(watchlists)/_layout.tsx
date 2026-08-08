import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { HeaderButton } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import {
  nestedTabPageScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";
import useRouter from "@/hooks/useAppRouter";
import { useStreamystatsEnabled } from "@/hooks/useWatchlists";

export default function WatchlistsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const streamystatsEnabled = useStreamystatsEnabled();

  return (
    <Stack screenOptions={stackScreenOptions}>
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
                <HeaderButton
                  onPress={() =>
                    router.push("/(auth)/(tabs)/(watchlists)/create")
                  }
                >
                  <HeaderIcon name='add' />
                </HeaderButton>
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
