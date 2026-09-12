import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { useHaptic } from "@/hooks/useHaptic";
import { useJellysleep } from "@/hooks/useJellysleep";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import type { SleepTimerOption } from "@/utils/atoms/settings";
import { formatDuration, sleepTimerOptionLabel } from "@/utils/formatDuration";

export const SleepTimerButton = () => {
  const { t } = useTranslation();
  const haptic = useHaptic("light");
  const offline = useOfflineMode();
  const {
    isEnabled,
    timerOptions,
    timerStatus,
    startTimer,
    cancelTimer,
    isPending,
  } = useJellysleep();

  if (Platform.isTV || offline || !isEnabled) return null;

  const active = timerStatus?.isActive ? timerStatus : undefined;

  // The server doesn't echo the option back, so match on type + value.
  const isActive = (o: SleepTimerOption) =>
    !!active &&
    o.type === active.type &&
    (o.duration ?? o.episodeCount) === (active.duration ?? active.episodeCount);

  const remaining =
    active &&
    (active.remainingMinutes != null
      ? `${formatDuration(active.remainingMinutes, t)} ${t("jellysleep.remaining")}`
      : t("jellysleep.after_episode", { count: active.remainingEpisodes }));

  return (
    <PlatformDropdown
      title={t("jellysleep.manage_timer")}
      groups={[
        {
          title: active && `${t("jellysleep.active_timer")}: ${remaining}`,
          options: timerOptions.map((o) => {
            const label = sleepTimerOptionLabel(o, t);
            return {
              type: "radio" as const,
              label,
              value: label,
              selected: isActive(o),
              disabled: isPending,
              onPress: () => {
                haptic();
                isActive(o) ? cancelTimer() : startTimer(o);
              },
            };
          }),
        },
      ]}
      bottomSheetConfig={{ enablePanDownToClose: true }}
      trigger={
        <View className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'>
          <Ionicons
            name={active ? "moon" : "moon-outline"}
            size={24}
            color={active ? "#3b82f6" : "white"}
          />
        </View>
      }
    />
  );
};
