import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { markExpectedError } from "@/utils/errors";
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

const notFound = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 404;

/**
 * The signed in person's notification choices on this server, changed optimistically: a
 * switch moves at once, and comes back with a message when the server refuses.
 *
 * Each change replaces what the plugin stores and answers with all of it, so changes go one
 * at a time, each carrying the ones before it, and an answer is shown once no change waits
 * behind it.
 */
export const useMyNotifications = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = myNotificationsKey(api?.basePath, user?.Id);
  // What the server last said while changes are on their way: a last change that fails goes
  // back to it.
  const confirmed = useRef<MyNotifications | undefined>(undefined);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        return await getMyNotifications(api!);
      } catch (error) {
        // A plugin without the route answers 404, which only means the screen is not
        // offered: nothing to report.
        throw notFound(error) ? markExpectedError(error) : error;
      }
    },
    enabled: !!api && !!user?.Id,
    // Offline, a retry waits for the network and the screen stays blank meanwhile.
    retry: (count, error) =>
      onlineManager.isOnline() && !notFound(error) && count < 2,
  });

  const run = useMutation({
    mutationKey: key,
    scope: { id: key.join(" ") },
    mutationFn: (change: () => Promise<MyNotifications>) => change(),
  });

  // The changes sent or waiting their turn; one that was answered no longer counts.
  const waiting = () => queryClient.isMutating({ mutationKey: key });

  const apply = async (
    optimistic: MyNotifications | undefined,
    change: () => Promise<MyNotifications>,
  ) => {
    // A read on its way answers with what the server had before this change.
    await queryClient.cancelQueries({ queryKey: key });
    if (waiting() === 0) {
      confirmed.current = queryClient.getQueryData<MyNotifications>(key);
    }
    if (optimistic) queryClient.setQueryData(key, optimistic);
    try {
      const saved = await run.mutateAsync(change);
      confirmed.current = saved;
      // An earlier answer lacks the changes still waiting, which the next switch would then
      // undo on the server.
      if (waiting() === 0) queryClient.setQueryData(key, saved);
    } catch {
      // A later change carries this one, so how that one goes decides.
      if (waiting() > 0) return;
      queryClient.setQueryData(key, confirmed.current);
      toast.error(t("home.settings.notifications.save_failed"));
      // The server may have kept part of it, so what it has decides, and the snapshot only
      // stands in until it answers.
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
