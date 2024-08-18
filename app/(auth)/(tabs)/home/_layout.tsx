import { Chromecast } from "@/components/Chromecast";
import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { TouchableOpacity } from "react-native";

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
          headerLeft: () => (
            <TouchableOpacity
              style={{
                marginRight: Platform.OS === "android" ? 17 : 0,
              }}
              onPress={() => {
                router.push("/(auth)/downloads");
              }}
            >
              <Feather name="download" color={"white"} size={22} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View className="flex flex-row items-center space-x-2">
              <Chromecast />
              <TouchableOpacity
                onPress={() => {
                  router.push("/(auth)/settings");
                }}
              >
                <View className="h-10 aspect-square flex items-center justify-center rounded">
                  <Feather name="settings" color={"white"} size={22} />
                </View>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
    </Stack>
  );
}
