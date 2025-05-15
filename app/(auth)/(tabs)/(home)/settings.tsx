import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { AudioToggles } from "@/components/settings/AudioToggles";
import { ChromecastSettings } from "@/components/settings/ChromecastSettings";
import DownloadSettings from "@/components/settings/DownloadSettings";
import { MediaProvider } from "@/components/settings/MediaContext";
import { MediaToggles } from "@/components/settings/MediaToggles";
import { OtherSettings } from "@/components/settings/OtherSettings";
import { PluginSettings } from "@/components/settings/PluginSettings";
import { QuickConnect } from "@/components/settings/QuickConnect";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { SubtitleToggles } from "@/components/settings/SubtitleToggles";
import { UserInfo } from "@/components/settings/UserInfo";
import { useHaptic } from "@/hooks/useHaptic";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { userAtom } from "@/providers/JellyfinProvider";
import { clearLogs } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { useNavigation, useRouter } from "expo-router";
import { t } from "i18next";
import { useAtom } from "jotai";
import React, { useEffect } from "react";
import { ScrollView, Switch, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user] = useAtom(userAtom);
  const { logout } = useJellyfin();
  const successHapticFeedback = useHaptic("success");

  const onClearLogsClicked = async () => {
    clearLogs();
    successHapticFeedback();
  };

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            logout();
          }}
        >
          <Text className='text-red-600'>
            {t("home.settings.log_out_button")}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, []);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className='p-4 flex flex-col gap-y-4'>
        <UserInfo />

        <QuickConnect className='mb-4' />

        <MediaProvider>
          <MediaToggles className='mb-4' />
          <AudioToggles className='mb-4' />
          <SubtitleToggles className='mb-4' />
        </MediaProvider>

        <OtherSettings />

        <DownloadSettings />

        <PluginSettings />

        <AppLanguageSelector />

        <ChromecastSettings />

        <ListGroup title={"Intro"}>
          <ListItem
            onPress={() => {
              router.push("/intro/page");
            }}
            title={t("home.settings.intro.show_intro")}
          />
          <ListItem
            textColor='red'
            onPress={() => {
              storage.set("hasShownIntro", false);
            }}
            title={t("home.settings.intro.reset_intro")}
          />
        </ListGroup>

        <View className='mb-4'>
          <ListGroup title={t("home.settings.logs.logs_title")}>
            <ListItem
              onPress={() => router.push("/settings/logs/page")}
              showArrow
              title={t("home.settings.logs.logs_title")}
            />
            <ListItem
              textColor='red'
              onPress={onClearLogsClicked}
              title={t("home.settings.logs.delete_all_logs")}
            />
          </ListGroup>
        </View>

        <StorageSettings />
      </View>
    </ScrollView>
  );
}
