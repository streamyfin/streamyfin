import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  getMyNotifications,
  type MyNotifications,
  myNotificationsKey,
  pauseNotifications,
  resumeNotifications,
  setMyNotifications,
  toUpdate,
  unmuteShow,
} from "@/utils/notificationPreferences";
import {
  isNotFound,
  readPluginRoute,
  retryPluginRead,
} from "@/utils/pluginReads";
import { useOrderedWrites } from "./useOrderedWrites";

/**
 * The signed in person's notification choices on this server, changed optimistically: a
 * switch moves at once, and comes back with a message when the server refuses. Each change
 * replaces what the plugin stores, so it carries the ones before it.
 */
export const useMyNotifications = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();
  const key = myNotificationsKey(api?.basePath, user?.Id);

  const query = useQuery({
    queryKey: key,
    queryFn: () => readPluginRoute(() => getMyNotifications(api!)),
    enabled: !!api && !!user?.Id,
    retry: retryPluginRead,
  });

  const apply = useOrderedWrites<MyNotifications>(key, {
    laterCarriesEarlier: true,
    onFailure: () => toast.error(t("home.settings.notifications.save_failed")),
  });

  return {
    mine: query.data,
    supported: !(query.isError && isNotFound(query.error)),
    isLoading: query.isLoading,
    // Failed for another reason than an older plugin: worth trying again.
    isError: query.isError && !isNotFound(query.error),
    refetch: query.refetch,
    update: (next: MyNotifications) =>
      apply(
        () => next,
        () => setMyNotifications(api!, toUpdate(next)),
      ),
    pause: (hours: number | null) =>
      apply(undefined, () => pauseNotifications(api!, hours)),
    resume: () => apply(undefined, () => resumeNotifications(api!)),
    unmute: (seriesId: string) =>
      apply(undefined, () => unmuteShow(api!, seriesId)),
  };
};
