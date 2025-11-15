import { useNavigation, useRouter } from "expo-router";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { QuickConnect } from "@/components/settings/QuickConnect";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { UserInfo } from "@/components/settings/UserInfo";
import { useJellyfin, userAtom } from "@/providers/JellyfinProvider";

export default function settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [_user] = useAtom(userAtom);
  const { logout } = useJellyfin();

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            logout();
          }}
        >
          <Text className='text-red-600 px-2'>
            {t("home.settings.log_out_button")}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, []);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <View className='mb-4'>
          <UserInfo />
        </View>

        <QuickConnect className='mb-4' />

        <View className='mb-4'>
          <AppLanguageSelector />
        </View>

        <View className='mb-4'>
          <ListGroup title={t("home.settings.categories.title")}>
            <ListItem
              onPress={() => router.push("/settings/playback-controls/page")}
              showArrow
              title={t("home.settings.playback_controls.title")}
            />
            <ListItem
              onPress={() => router.push("/settings/audio-subtitles/page")}
              showArrow
              title={t("home.settings.audio_subtitles.title")}
            />
            <ListItem
              onPress={() => router.push("/settings/appearance/page")}
              showArrow
              title={t("home.settings.appearance.title")}
            />
            <ListItem
              onPress={() => router.push("/settings/plugins/page")}
              showArrow
              title={t("home.settings.plugins.plugins_title")}
            />
            <ListItem
              onPress={() => router.push("/settings/intro/page")}
              showArrow
              title={t("home.settings.intro.title")}
            />
            <ListItem
              onPress={() => router.push("/settings/logs/page")}
              showArrow
              title={t("home.settings.logs.logs_title")}
            />
          </ListGroup>
        </View>

        {!Platform.isTV && <StorageSettings />}
      </View>
    </ScrollView>
  );
}
