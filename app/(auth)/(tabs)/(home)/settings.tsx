import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { AudioToggles } from "@/components/settings/AudioToggles";
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
import { clearLogs } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { RECENTLY_ADDED_SENT_NOTIFICATIONS_ITEM_IDS_KEY } from "@/utils/recently-added-notifications";
import { useNavigation, useRouter } from "expo-router";
import { t } from "i18next";
import React, { useCallback, useEffect, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as TaskManager from "expo-task-manager";
import { BACKGROUND_FETCH_TASK_RECENTLY_ADDED } from "@/utils/background-tasks";
import { RecentlyAddedNotificationsSettings } from "@/components/settings/RecentlyAddedNotifications";

export default function settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
          <Text className="text-red-600">
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
      <View className="p-4 flex flex-col gap-y-4">
        <UserInfo />
        <QuickConnect className="mb-4" />

        <MediaProvider>
          <MediaToggles className="mb-4" />
          <AudioToggles className="mb-4" />
          <SubtitleToggles className="mb-4" />
        </MediaProvider>

        <OtherSettings />

        <DownloadSettings />

        <PluginSettings />

        <AppLanguageSelector />

        <ListGroup title={"Intro"}>
          <ListItem
            onPress={() => {
              router.push("/intro/page");
            }}
            title={t("home.settings.intro.show_intro")}
          />
          <ListItem
            textColor="red"
            onPress={() => {
              storage.set("hasShownIntro", false);
            }}
            title={t("home.settings.intro.reset_intro")}
          />
        </ListGroup>

        <View className="">
          <ListGroup title={t("home.settings.logs.logs_title")}>
            <ListItem
              onPress={() => router.push("/settings/logs/page")}
              showArrow
              title={t("home.settings.logs.logs_title")}
            />
            <ListItem
              textColor="red"
              onPress={onClearLogsClicked}
              title={t("home.settings.logs.delete_all_logs")}
            />
          </ListGroup>
        </View>

        <RecentlyAddedNotificationsSettings />

        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: "white",
            overflow: "hidden",
            marginVertical: 16,
            opacity: 0.3,
          }}
        ></View>

        <View className="">
          <StorageSettings />
        </View>
      </View>
    </ScrollView>
  );
}
