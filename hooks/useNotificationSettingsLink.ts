import { useEffect } from "react";
import { Platform } from "react-native";
import { NOTIFICATIONS_SETTINGS_ROUTE } from "@/constants/Notifications";
import useRouter from "@/hooks/useAppRouter";
import {
  addSettingsOpenListener,
  takePendingSettingsOpen,
} from "@/modules/notification-settings-link";

/** Opens the Notifications screen when the person comes from the link in the iOS Settings. */
export const useNotificationSettingsLink = (): void => {
  const router = useRouter();

  useEffect(() => {
    if (Platform.isTV) return;
    const open = () => router.push(NOTIFICATIONS_SETTINGS_ROUTE as never);
    if (takePendingSettingsOpen()) open();
    const subscription = addSettingsOpenListener(open);
    return () => subscription?.remove();
  }, [router]);
};
