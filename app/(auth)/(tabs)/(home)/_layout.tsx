import { Feather, Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import useRouter from "@/hooks/useAppRouter";

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
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          title: t("home.downloads.downloads_title"),
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
          headerLeft: () => (
            <Pressable
              onPress={() => _router.back()}
              className='pl-0.5'
              style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
            >
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
            <Pressable onPress={() => _router.back()} className='pl-0.5'>
              <Feather name='chevron-left' size={28} color='white' />
            </Pressable>
          ),
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
    <Pressable
      onPress={() => {
        router.push("/(auth)/settings");
      }}
    >
      <Feather name='settings' color={"white"} size={22} />
    </Pressable>
  );
};

const SessionsButton = () => {
  const router = useRouter();
  const { sessions = [] } = useSessions({} as useSessionsProps);

  return (
    <Pressable
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
    </Pressable>
  );
};
