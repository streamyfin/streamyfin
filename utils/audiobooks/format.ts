import type { TFunction } from "i18next";

const split = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
};

/** "12 h 4 min": a book's or a chapter's length. */
export const formatBookLength = (seconds: number, t: TFunction): string => {
  const { hours, minutes } = split(seconds);
  return hours > 0
    ? t("audiobooks.length_hours", { hours, minutes })
    : t("audiobooks.length_minutes", { minutes });
};

/** "3 h 20 min left". */
export const formatTimeLeft = (seconds: number, t: TFunction): string => {
  const { hours, minutes } = split(seconds);
  return hours > 0
    ? t("audiobooks.time_left_hours", { hours, minutes })
    : t("audiobooks.time_left_minutes", { minutes: Math.max(minutes, 1) });
};

/** "1:02:03", or "2:03" under an hour. */
export const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** "1.25×": a playback speed. */
export const formatRate = (rate: number): string =>
  `${Number.isInteger(rate) ? rate.toFixed(1) : String(rate)}×`;
