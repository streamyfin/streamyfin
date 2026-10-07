import { useEffect } from "react";
import { Platform } from "react-native";
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
    const open = () => router.push("/settings/notifications/page" as never);
    if (takePendingSettingsOpen()) open();
    const subscription = addSettingsOpenListener(open);
    return () => subscription?.remove();
  }, [router]);
};
