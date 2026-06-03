import * as Notifications from "expo-notifications";
import { t } from "i18next";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Switch } from "react-native";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { useSettings } from "@/utils/atoms/settings";

export default function NotificationsPage() {
  const { settings, updateSettings } = useSettings();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((p) => setGranted(p.granted));
  }, []);

  const requestPermission = async () => {
    const p = await Notifications.requestPermissionsAsync();
    setGranted(p.granted);
    if (!p.granted) Linking.openSettings();
  };

  if (!settings) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ListGroup title={t("home.settings.notifications.permission_title")}>
        <ListItem
          title={t("home.settings.notifications.system_permission")}
          value={
            granted == null
              ? "…"
              : granted
                ? t("home.settings.notifications.granted")
                : t("home.settings.notifications.denied")
          }
          textColor={granted ? "default" : "blue"}
          onPress={granted ? undefined : requestPermission}
        />
      </ListGroup>
      <ListGroup
        title={t("home.settings.notifications.events_title")}
        className='mt-4'
      >
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
