import type { NotificationPause } from "@/utils/notificationPreferences";

/**
 * Whether a pause holds notifications back now, and until when; no end means until it is
 * turned back on. The server keeps a pause after it ends, and it then holds nothing back.
 */
export const pauseState = (
  pause: NotificationPause | null,
  now: Date,
): { paused: boolean; until: Date | null } => {
  if (!pause) return { paused: false, until: null };
  if (!pause.until) return { paused: true, until: null };

  const until = new Date(pause.until);
  return until > now ? { paused: true, until } : { paused: false, until: null };
};

/** When a pause ends: a time today, or the day as well when it ends on another one. */
export const pauseUntilText = (
  until: Date,
  now: Date,
  locale?: string,
  timeZone?: string,
): string => {
  const time = { hour: "2-digit", minute: "2-digit", timeZone } as const;
  const day = (date: Date) => date.toLocaleDateString(locale, { timeZone });

  return day(until) === day(now)
    ? until.toLocaleTimeString(locale, time)
    : until.toLocaleString(locale, { weekday: "short", ...time });
};
