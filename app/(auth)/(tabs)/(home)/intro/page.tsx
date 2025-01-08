import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { storage } from "@/utils/mmkv";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { TouchableOpacity, View } from "react-native";
import {useTranslation } from "react-i18next";

export default function page() {
  const router = useRouter();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      storage.set("hasShownIntro", true);
    }, [])
  );

  return (
    <View className="bg-neutral-900 h-full py-32 px-4 space-y-4">
      <View>
        <Text className="text-3xl font-bold text-center mb-2">
          {t("home.intro.welcome_to_streamyfin")}
        </Text>
        <Text className="text-center">
          {t("home.intro.a_free_and_open_source_client_for_jellyfin")}
        </Text>
      </View>

      <View>
        <Text className="text-lg font-bold">{t("home.intro.features_title")}</Text>
        <Text className="text-xs">
          {t("home.intro.features_description")}
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
              {t("home.intro.jellyseerr_feature_description")}
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
            <Text className="font-bold mb-1">{t("home.intro.downloads_feature_title")}</Text>
            <Text className="shrink text-xs">
              {t("home.intro.downloads_feature_description")}
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
              {t("home.intro.chromecast_feature_description")}
            </Text>
          </View>
        </View>
      </View>

      <Button
        onPress={() => {
          router.back();
        }}
        className="mt-4"
      >
        {t("home.intro.done_button")}
      </Button>
      <TouchableOpacity
        onPress={() => {
          router.back();
          router.push("/settings");
        }}
        className="mt-4"
      >
        <Text className="text-purple-600 text-center">{t("home.intro.go_to_settings_button")}</Text>
      </TouchableOpacity>
    </View>
  );
}
