import type { SleepTimerOption } from "@/utils/atoms/settings";

type T = (key: string, options?: { count?: number }) => string;

/** 15 -> "15 minutes", 60 -> "1 hour", 90 -> "1 hour 30 minutes" */
export const formatDuration = (minutes: number, t: T): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [];
  if (hours) parts.push(`${hours} ${t("jellysleep.hour", { count: hours })}`);
  if (rest || !hours)
    parts.push(`${rest} ${t("jellysleep.minute", { count: rest })}`);
  return parts.join(" ");
};

/** Labels are derived at render time so they follow the app language. */
export const sleepTimerOptionLabel = (o: SleepTimerOption, t: T): string =>
  o.duration != null
    ? formatDuration(o.duration, t)
    : t("jellysleep.after_episode", { count: o.episodeCount ?? 1 });
