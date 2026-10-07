import type { QueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import { MY_NOTIFICATIONS_QUERY } from "@/hooks/useMyNotifications";
import { apiAtom } from "@/providers/JellyfinProvider";
import { handleNotificationAction } from "@/utils/notificationActions";

type Response = Parameters<typeof handleNotificationAction>[0];

const isButton = (response: Response | null): response is Response =>
  !!response &&
  response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER;

/**
 * Carries out the buttons on the plugin's notifications: one pressed while the app runs,
 * and the one that opened it. A plain tap is left to the navigation.
 *
 * Takes the query client rather than reading it from context: the root layout calls it
 * above its provider.
 */
export const useNotificationActions = (queryClient: QueryClient): void => {
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();

  useEffect(() => {
    if (Platform.isTV || !api) return;

    const carryOut = async (response: Response) => {
      // Forgotten at once, so a later start or a new run of this effect does not do it again.
      Notifications.clearLastNotificationResponse();
      try {
        const done = await handleNotificationAction(response, api);
        if (!done) return;
        toast.success(
          t(
            done === "paused"
              ? "home.settings.notifications.actions.paused"
              : "home.settings.notifications.actions.muted",
          ),
        );
        // The Notifications screen shows what the button changed.
        void queryClient.invalidateQueries({
          queryKey: [MY_NOTIFICATIONS_QUERY],
        });
      } catch {
        toast.error(t("home.settings.notifications.save_failed"));
      }
    };

    const opening = Notifications.getLastNotificationResponse();
    if (isButton(opening)) void carryOut(opening);

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (isButton(response)) void carryOut(response);
      },
    );
    return () => subscription.remove();
  }, [api, queryClient, t]);
};
