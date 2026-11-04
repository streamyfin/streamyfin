import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import i18n from "@/i18n";
import { registerNotificationCategories } from "@/utils/notificationActions";
import { createNotificationChannels } from "@/utils/notificationChannels";
import { invalidateQueriesWhenOnline } from "@/utils/query/networkAwareInvalidate";

type Notifications = Parameters<typeof createNotificationChannels>[0] &
  Parameters<typeof registerNotificationCategories>[0];

/**
 * Shows the app in `language` once the stored settings have hydrated, and
 * names the notification channels and buttons in it. `notifications` is
 * expo-notifications, which a TV build does not load.
 */
export const useAppLanguage = (
  language: string,
  settingsLoaded: boolean,
  queryClient: QueryClient,
  notifications: Notifications | null,
): void => {
  useEffect(() => {
    // Until the stored settings hydrate, `settings` holds the defaults, and
    // following them would move i18n off the stored language it started in.
    if (!settingsLoaded) return;
    const changed = language !== i18n.language;
    void (changed ? i18n.changeLanguage(language) : Promise.resolve()).then(
      () => {
        // A Jellyfin 12 server answers in the language of the request (track
        // names, for one), so what is cached is in the previous one. Screens
        // that stay mounted, in another tab for instance, would keep showing
        // it. Only when online: offline the refetches would fail, and a query
        // in the error state is dropped from the persisted cache offline mode
        // reads.
        if (changed) void invalidateQueriesWhenOnline(queryClient, {});
        // At the first hydrated run too, when the language is already the
        // stored one: the channels and buttons are named once in it.
        if (Platform.isTV || !notifications) return;
        // One channel per family the plugin sends, named in the app's language:
        // Android shows each name in its settings as it was last given.
        if (Platform.OS === "android") {
          void createNotificationChannels(notifications, (key) => i18n.t(key));
        }
        // The buttons the plugin's notifications carry, titled in the app's
        // language.
        void registerNotificationCategories(notifications, (key) =>
          i18n.t(key),
        );
      },
    );
  }, [settingsLoaded, language, queryClient, notifications]);
};
