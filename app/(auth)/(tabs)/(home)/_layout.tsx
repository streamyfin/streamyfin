import { Chromecast } from "@/components/Chromecast";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Platform, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

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
          headerTitle: t("home.home"),
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
          headerRight: () => (
            <View className="flex flex-row items-center space-x-2">
              <Chromecast />
              <TouchableOpacity
                onPress={() => {
                  router.push("/(auth)/settings");
                }}
              >
                <Feather name="settings" color={"white"} size={22} />
              </TouchableOpacity>
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
        name="settings"
        options={{
          title: t("home.settings.settings_title"),
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
