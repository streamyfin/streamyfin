import { Feather, Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";

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
          headerShown: true,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          title: t("home.downloads.downloads_title"),
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='downloads/[seriesId]'
        options={{
          headerShown: true,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          title: t("home.downloads.tvseries"),
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='sessions/index'
        options={{
          title: t("home.sessions.title"),
          headerShown: true,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings'
        options={{
          title: t("home.settings.settings_title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/playback-controls/page'
        options={{
          title: t("home.settings.playback_controls.title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/audio-subtitles/page'
        options={{
          title: t("home.settings.audio_subtitles.title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/appearance/page'
        options={{
          title: t("home.settings.appearance.title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/appearance/hide-libraries/page'
        options={{
          title: t("home.settings.other.hide_libraries"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/plugins/page'
        options={{
          title: t("home.settings.plugins.plugins_title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/plugins/marlin-search/page'
        options={{
          title: "Marlin Search",
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/plugins/jellyseerr/page'
        options={{
          title: "Jellyseerr",
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/intro/page'
        options={{
          title: t("home.settings.intro.title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='settings/logs/page'
        options={{
          title: t("home.settings.logs.logs_title"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name='intro/page'
        options={{
          headerShown: false,
          title: "",
          headerLeft: () => (
            <TouchableOpacity onPress={() => _router.back()} className='pl-0.5'>
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
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
          headerLeft: () => (
            <TouchableOpacity onPress={() => _router.back()} className='pl-0.5'>
              <Feather name='chevron-left' size={28} color='white' />
            </TouchableOpacity>
          ),
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
