import { Chromecast } from "@/components/Chromecast";
import { Text } from "@/components/common/Text";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
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
          headerLargeStyle: {
            backgroundColor: "black",
          },
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
          title: "Downloads",
        }}
      />
      <Stack.Screen
        name="downloads/[seriesId]"
        options={{
          title: "TV-Series",
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: "Settings",
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
        name="settings/jellyseerr/page"
        options={{
          title: "",
        }}
      />
      <Stack.Screen
        name="settings/popular-lists/page"
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
