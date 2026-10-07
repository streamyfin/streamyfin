import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  getMyNotifications,
  type MyNotifications,
  pauseNotifications,
  resumeNotifications,
  setMyNotifications,
  toUpdate,
  unmuteShow,
} from "@/utils/notificationPreferences";

const notFound = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 404;

/** The query key every reader of the person's choices shares. */
export const MY_NOTIFICATIONS_QUERY = "myNotifications";

/**
 * The signed in person's notification choices on this server, changed optimistically: a
 * switch moves at once, and comes back with a message when the server refuses.
 */
export const useMyNotifications = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = [MY_NOTIFICATIONS_QUERY, api?.basePath, user?.Id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => getMyNotifications(api!),
    enabled: !!api && !!user?.Id,
    // A plugin without the route answers 404, which only means the screen is not offered.
    retry: (count, error) => !notFound(error) && count < 2,
  });

  const run = useMutation({
    mutationFn: (change: () => Promise<MyNotifications>) => change(),
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });

  const apply = async (
    optimistic: MyNotifications | undefined,
    change: () => Promise<MyNotifications>,
  ) => {
    const before = queryClient.getQueryData<MyNotifications>(key);
    if (optimistic) queryClient.setQueryData(key, optimistic);
    try {
      await run.mutateAsync(change);
    } catch {
      queryClient.setQueryData(key, before);
      toast.error(t("home.settings.notifications.save_failed"));
      // A later change may have carried this one to the server already, so what it kept
      // decides, and the snapshot only stands in until it answers.
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return {
    mine: query.data,
    supported: !(query.isError && notFound(query.error)),
    isLoading: query.isLoading,
    // Failed for another reason than an older plugin: worth trying again.
    isError: query.isError && !notFound(query.error),
    refetch: query.refetch,
    update: (next: MyNotifications) =>
      apply(next, () => setMyNotifications(api!, toUpdate(next))),
    pause: (hours: number | null) =>
      apply(undefined, () => pauseNotifications(api!, hours)),
    resume: () => apply(undefined, () => resumeNotifications(api!)),
    unmute: (seriesId: string) =>
      apply(undefined, () => unmuteShow(api!, seriesId)),
  };
};
