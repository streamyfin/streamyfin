import { useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderButton } from "@/components/common/HeaderButton";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { QuickConnect } from "@/components/settings/QuickConnect";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { UserInfo } from "@/components/settings/UserInfo";
import useRouter from "@/hooks/useAppRouter";
import { useJellyfin, userAtom } from "@/providers/JellyfinProvider";

// TV-specific settings component
const SettingsTV = Platform.isTV ? require("./settings.tv").default : null;

// Mobile settings component
function SettingsMobile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [_user] = useAtom(userAtom);
  const { logout } = useJellyfin();

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton
          variant='text'
          onPress={() => {
            logout();
          }}
        >
          <Text className='text-red-600'>
            {t("home.settings.log_out_button")}
          </Text>
        </HeaderButton>
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

        {Platform.OS !== "ios" && (
          <View className='mb-4'>
            <ListGroup title={t("pairing.pair_with_phone_title")}>
              <ListItem
                onPress={() =>
                  router.push("/(auth)/(tabs)/(home)/companion-login")
                }
                title={t("pairing.pair_with_phone")}
                textColor='blue'
              />
            </ListGroup>
          </View>
        )}

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
              onPress={() => router.push("/settings/music/page")}
              showArrow
              title={t("home.settings.music.title")}
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
              onPress={() => router.push("/settings/network/page")}
              showArrow
              title={t("home.settings.network.title")}
            />
            <ListItem
              onPress={() => router.push("/settings/logs/page")}
              showArrow
              title={t("home.settings.logs.logs_title")}
            />
          </ListGroup>
        </View>

        <StorageSettings />
      </View>
    </ScrollView>
  );
}

export default function settings() {
  // Use TV settings component on TV platforms
  if (Platform.isTV && SettingsTV) {
    return <SettingsTV />;
  }

  return <SettingsMobile />;
}
