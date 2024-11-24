import { Chromecast } from "@/components/Chromecast";
import { HeaderBackButton } from "@/components/common/HeaderBackButton";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { useDownload } from "@/providers/DownloadProvider";
import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Platform, TouchableOpacity, View } from "react-native";

export default function IndexLayout() {
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: "Home",
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
          headerRight: () => (
            <View className="flex flex-row items-center">
              <Chromecast />
              <TouchableOpacity
                onPress={() => {
                  router.push("/(auth)/settings");
                }}
                className="pl-2"
              >
                <Feather name="settings" color={"white"} size={22} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="downloads"
        options={{
          title: "Downloads",
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: "Settings",
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
