import { Feather, Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  View,
} from "react-native";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { eventBus } from "@/utils/eventBus";

const Chromecast = Platform.isTV ? null : require("@/components/Chromecast");

import { useAtom } from "jotai";
import { useSessions, type useSessionsProps } from "@/hooks/useSessions";
import { userAtom } from "@/providers/JellyfinProvider";

export default function IndexLayout() {
  const _router = useRouter();
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("tabs.home"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerRight: () => (
            <View className='flex flex-row items-center px-2'>
              {!Platform.isTV && (
                <>
                  <Chromecast.Chromecast background='transparent' />
                  <RefreshButton />
                  {user?.Policy?.IsAdministrator && <SessionsButton />}
                  <SettingsButton />
                </>
              )}
            </View>
          ),
        }}
      />
      <Stack.Screen
        name='downloads/index'
        options={{
          title: t("home.downloads.downloads_title"),
        }}
      />
      <Stack.Screen
        name='downloads/[seriesId]'
        options={{
          title: t("home.downloads.tvseries"),
        }}
      />
      <Stack.Screen
        name='sessions/index'
        options={{
          title: t("home.sessions.title"),
        }}
      />
      <Stack.Screen
        name='settings'
        options={{
          title: t("home.settings.settings_title"),
        }}
      />
      <Stack.Screen
        name='settings/marlin-search/page'
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name='settings/jellyseerr/page'
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name='settings/hide-libraries/page'
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name='settings/logs/page'
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name='intro/page'
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
        name='collections/[collectionId]'
        options={{
          title: "",
          headerShown: true,
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
    <TouchableOpacity
      onPress={() => {
        router.push("/(auth)/settings");
      }}
    >
      <Feather name='settings' color={"white"} size={22} />
    </TouchableOpacity>
  );
};

const RefreshButton = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    eventBus.emit("refreshHome");
    setTimeout(() => {
      setIsRefreshing(false);
    }, 2000);
  };

  return (
    <TouchableOpacity
      onPress={handleRefresh}
      className='mr-4'
      disabled={isRefreshing}
    >
      {isRefreshing ? (
        <ActivityIndicator size='small' color='white' />
      ) : (
        <Ionicons name='refresh-outline' color='white' size={24} />
      )}
    </TouchableOpacity>
  );
};

const SessionsButton = () => {
  const router = useRouter();
  const { sessions = [] } = useSessions({} as useSessionsProps);

  return (
    <TouchableOpacity
      onPress={() => {
        router.push("/(auth)/sessions");
      }}
      className='mr-4'
    >
      <Ionicons
        name='play-circle'
        color={sessions.length === 0 ? "white" : "#9333ea"}
        size={28}
      />
    </TouchableOpacity>
  );
};
