import type * as NotificationsType from "expo-notifications";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { openNotificationSettings } from "@/utils/openNotificationSettings";

// Left out of TV builds (react-native.config.js), where loading it fails as the app starts.
const Notifications = Platform.isTV
  ? null
  : (require("expo-notifications") as typeof NotificationsType);

/** Says when the phone itself blocks the app's notifications, whatever is chosen below. */
export const NotificationPermissionBanner: React.FC = () => {
  const { t } = useTranslation();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    // Null on TV, which has no notification permission to ask about.
    const notifications = Notifications;
    if (!notifications) return;
    const check = () =>
      notifications
        .getPermissionsAsync()
        .then(({ status }) => setBlocked(status !== "granted"));
    void check();
    // Back from the system settings, the answer may have changed.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => subscription.remove();
  }, []);

  if (!blocked) return null;

  return (
    <View className='mb-4 rounded-xl border border-red-900 bg-red-950 p-3'>
      <Text className='font-semibold'>
        {t("home.settings.notifications.blocked.title")}
      </Text>
      <Text className='mt-1 text-xs text-neutral-400'>
        {t("home.settings.notifications.blocked.body")}
      </Text>
      <TouchableOpacity
        onPress={() => void openNotificationSettings()}
        className='mt-2'
      >
        <Text className='font-semibold text-purple-500'>
          {t("home.settings.notifications.blocked.open")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
