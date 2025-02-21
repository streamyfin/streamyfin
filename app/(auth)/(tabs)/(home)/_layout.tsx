import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Platform, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
const Chromecast = !Platform.isTV ? require("@/components/Chromecast") : null;
import { useAtom } from "jotai";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSessions, useSessionsProps } from "@/hooks/useSessions";

export default function IndexLayout() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: t("tabs.home"),
          headerBlurEffect: "prominent",
          headerLargeStyle: {
            backgroundColor: "black",
          },
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
          headerRight: () => (
            <View className="flex flex-row items-center space-x-2">
              {!Platform.isTV && (
                <>
                  <Chromecast.Chromecast />
                  <SessionsButton />
                  <SettingsButton />
                </>
              )}
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="downloads/index"
        options={{
          title: t("home.downloads.downloads_title"),
        }}
      />
      <Stack.Screen
        name="downloads/[seriesId]"
        options={{
          title: t("home.downloads.tvseries"),
        }}
      />
      <Stack.Screen
        name="sessions/index"
        options={{
          title: t("home.sessions.title"),
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: t("home.settings.settings_title"),
        }}
      />
      <Stack.Screen
        name="settings/optimized-server/page"
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name="settings/marlin-search/page"
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name="settings/dashboard/sessions"
        options={{
          title: t("home.settings.dashboard.sessions_title"),
        }}
      />
      <Stack.Screen
        name="settings/jellyseerr/page"
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name="settings/hide-libraries/page"
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name="settings/logs/page"
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name="intro/page"
        options={{
          headerShown: false,
          title: "",
          presentation: "modal",
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
      <Stack.Screen
        name="collections/[collectionId]"
        options={{
          title: "",
          headerShown: true,
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}

const SettingsButton = () => {
  const router = useRouter();
  const [user] = useAtom(userAtom);

  return (
    <TouchableOpacity
      onPress={() => {
        router.push("/(auth)/settings");
      }}
    >
      <Feather name="settings" color={"white"} size={22} />
    </TouchableOpacity>
  );
};

const SessionsButton = () => {
  const router = useRouter();
  const { sessions = [], _ } = useSessions({} as useSessionsProps);

  return (
    <TouchableOpacity
      onPress={() => {
        router.push("/(auth)/sessions");
      }}
    >
      <View className="mr-4">
        <Feather
          name="play"
          color={sessions.length === 0 ? "white" : "purple"}
          size={22}
        />
      </View>
    </TouchableOpacity>
  );
};
