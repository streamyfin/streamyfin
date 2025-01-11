import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { storage } from "@/utils/mmkv";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Linking, TouchableOpacity, View } from "react-native";

export default function page() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      storage.set("hasShownIntro", true);
    }, [])
  );

  return (
    <View className="bg-neutral-900 h-full py-16 px-4 space-y-8">
      <View>
        <Text className="text-3xl font-bold text-center mb-2">
          Welcome to Streamyfin
        </Text>
        <Text className="text-center">
          A free and open source client for Jellyfin.
        </Text>
      </View>

      <View>
        <Text className="text-lg font-bold">Features</Text>
        <Text className="text-xs">
          Streamyfin has a bunch of features and integrates with a wide array of
          software which you can find in the settings menu, these include:
        </Text>
        <View className="flex flex-row items-center mt-4">
          <Image
            source={require("@/assets/icons/jellyseerr-logo.svg")}
            style={{
              width: 50,
              height: 50,
            }}
          />
          <View className="shrink ml-2">
            <Text className="font-bold mb-1">Jellyseerr</Text>
            <Text className="shrink text-xs">
              Connect to your Jellyseerr instance and request movies directly in
              the app.
            </Text>
          </View>
        </View>
        <View className="flex flex-row items-center mt-4">
          <View
            style={{
              width: 50,
              height: 50,
            }}
            className="flex items-center justify-center"
          >
            <Ionicons name="cloud-download-outline" size={32} color="white" />
          </View>
          <View className="shrink ml-2">
            <Text className="font-bold mb-1">Downloads</Text>
            <Text className="shrink text-xs">
              Download movies and tv-shows to view offline. Use either the
              default method or install the optimize server to download files in
              the background.
            </Text>
          </View>
        </View>
        <View className="flex flex-row items-center mt-4">
          <View
            style={{
              width: 50,
              height: 50,
            }}
            className="flex items-center justify-center"
          >
            <Feather name="cast" size={28} color={"white"} />
          </View>
          <View className="shrink ml-2">
            <Text className="font-bold mb-1">Chromecast</Text>
            <Text className="shrink text-xs">
              Cast movies and tv-shows to your Chromecast devices.
            </Text>
          </View>
        </View>
        <View className="flex flex-row items-center mt-4">
          <View
            style={{
              width: 50,
              height: 50,
            }}
            className="flex items-center justify-center"
          >
            <Feather name="settings" size={28} color={"white"} />
          </View>
          <View className="shrink ml-2">
            <Text className="font-bold mb-1">Centralised Settings Plugin</Text>
            <Text className="shrink text-xs">
              Configure settings from a centralised location on your Jellyfin
              server. All client settings for all users will be synced
              automatically.{" "}
              <Text
                className="text-purple-600"
                onPress={() => {
                  Linking.openURL(
                    "https://github.com/streamyfin/jellyfin-plugin-streamyfin"
                  );
                }}
              >
                Read more
              </Text>
            </Text>
          </View>
        </View>
      </View>
      <View>
        <Button
          onPress={() => {
            router.back();
          }}
          className="mt-4"
        >
          Done
        </Button>
        <TouchableOpacity
          onPress={() => {
            router.back();
            router.push("/settings");
          }}
          className="mt-4"
        >
          <Text className="text-purple-600 text-center">Go to settings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
