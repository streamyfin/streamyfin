import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { type SleepTimerOption, useSettings } from "@/utils/atoms/settings";

const STATUS_KEY = ["jellysleep", "status"];

export const useJellysleep = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEnabled = settings?.jellysleepEnabled ?? false;

  // The plugin expires timers server-side and cancels multi-episode timers on
  // any non-completion stop, so the client has to keep asking.
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api!.getSleepTimerStatus().then((r) => r.data),
    enabled: !!api && isEnabled,
    refetchInterval: 60_000,
    retry: false, // 404 = plugin not installed; don't hammer the server
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const start = useMutation({
    mutationFn: (option: SleepTimerOption) =>
      api!.startSleepTimer(option).then((r) => r.data),
    onSuccess: (r) =>
      r.success
        ? refresh()
        : Alert.alert(
            t("jellysleep.error_title"),
            r.error || t("jellysleep.error_generic"),
          ),
    onError: () =>
      Alert.alert(t("jellysleep.error_title"), t("jellysleep.error_generic")),
  });

  const cancel = useMutation({
    mutationFn: () => api!.cancelSleepTimer(),
    // A 404 means the timer already ended server-side; either way local
    // state is stale, so refetch instead of treating it as a failure.
    onSettled: refresh,
  });

  return {
    isEnabled,
    timerOptions: settings?.jellysleepTimerOptions ?? [],
    timerStatus: status.data,
    startTimer: start.mutate,
    cancelTimer: cancel.mutate,
    isPending: start.isPending || cancel.isPending,
  };
};
