import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { t } from "i18next";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Switch, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { useSettings } from "@/utils/atoms/settings";

export default function NotificationsPage() {
  const { settings, updateSettings } = useSettings();
  const [perm, setPerm] =
    useState<Notifications.NotificationPermissionsStatus | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(setPerm);
  }, []);

  const requestPermission = async () => {
    const res = await Notifications.requestPermissionsAsync();
    setPerm(res);
    // Only bounce to system settings when the OS will not prompt again.
    if (!res.granted && res.canAskAgain === false) {
      Linking.openSettings();
    }
  };

  if (!settings || perm === null) return null;

  if (!perm.granted) {
    return (
      <View className='flex-1 items-center justify-center px-8'>
        <Ionicons name='notifications-off-outline' size={56} color='#5A5960' />
        <Text className='text-white text-lg font-semibold mt-4 text-center'>
          {t("home.settings.notifications.disabled_title")}
        </Text>
        <Text className='text-[#9899A1] text-center mt-2'>
          {t("home.settings.notifications.disabled_description")}
        </Text>
        <Button color='purple' className='mt-6' onPress={requestPermission}>
          {t("home.settings.notifications.enable_button")}
        </Button>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ListGroup title={t("home.settings.notifications.events_title")}>
        <ListItem title={t("home.settings.notifications.master")}>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={(v) => updateSettings({ notificationsEnabled: v })}
          />
        </ListItem>
        <ListItem title={t("home.settings.notifications.downloads")}>
          <Switch
            value={settings.notifyDownloads}
            disabled={!settings.notificationsEnabled}
            onValueChange={(v) => updateSettings({ notifyDownloads: v })}
          />
        </ListItem>
      </ListGroup>
    </ScrollView>
  );
}
