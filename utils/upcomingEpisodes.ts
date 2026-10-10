import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

const DAY_MS = 86_400_000;

const dayKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The device's own calendar day, as "YYYY-MM-DD". */
export const localDayKey = (now: Date) =>
  dayKey(now.getFullYear(), now.getMonth(), now.getDate());

/**
 * The calendar day an episode airs, as "YYYY-MM-DD", or null without a usable
 * premiere date.
 *
 * Metadata providers give an episode a day, not a moment, and the server
 * stores it as midnight UTC: read in the device's time zone it lands on the
 * day before anywhere west of UTC. Anything else was written with a time zone
 * (an NFO parsed in the server's own), and is read in the device's.
 */
export const airDayKey = (premiereDate?: string | null): string | null => {
  if (!premiereDate) return null;
  const date = new Date(premiereDate);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return time % DAY_MS === 0
    ? dayKey(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : localDayKey(date);
};

export type AirDayGroup = { day: string; items: BaseItemDto[] };

/**
 * Episodes by the day they air, earliest day first. Pages can overlap when the
 * library changes between two requests, so an episode is only listed once.
 * `/Shows/Upcoming` filters on the premiere date, so an item without one does
 * not come from it and has no day to be listed under.
 */
export const groupByAirDay = (items: BaseItemDto[]): AirDayGroup[] => {
  const groups = new Map<string, BaseItemDto[]>();
  const seen = new Set<string>();
  for (const item of items) {
    const day = airDayKey(item.PremiereDate);
    if (!item.Id || !day || seen.has(item.Id)) continue;
    seen.add(item.Id);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayItems]) => ({ day, items: dayItems }));
};

/** Whole days from today to `day`: -1 is yesterday, 1 is tomorrow. */
export const airDayOffset = (day: string, now: Date): number =>
  Math.round((Date.parse(day) - Date.parse(localDayKey(now))) / DAY_MS);

/** "Tuesday, October 6", in the app's language. */
export const formatAirDay = (day: string, locale?: string): string =>
  new Date(day).toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * A series' air time, in the clock format of `locale` or of the device when
 * none is given. Providers write it freely ("21:00", "9:00 PM"), so anything
 * that is not a time of day is shown as is.
 */
export const formatAirTime = (
  airTime?: string | null,
  locale?: string,
): string | null => {
  const raw = airTime?.trim();
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(raw);
  if (!match) return raw;
  const meridiem = match[3]?.toLowerCase();
  const hours = meridiem
    ? (Number(match[1]) % 12) + (meridiem === "pm" ? 12 : 0)
    : Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return raw;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
};

/**
 * Where the next page of `/Shows/Upcoming` starts, or undefined after the
 * last one. The endpoint reports the size of the page as its total record
 * count, so only a short page tells the list has ended.
 */
export const nextUpcomingStartIndex = (
  pages: BaseItemDto[][],
  pageSize: number,
): number | undefined =>
  (pages.at(-1)?.length ?? 0) < pageSize
    ? undefined
    : pages.reduce((count, page) => count + page.length, 0);

/**
 * Why an episode has no file to play: it has not aired yet, or it has and the
 * library lacks it. Null for anything playable. Jellyfin Web draws the same
 * line: unaired until the premiere date, missing from then on.
 */
export const episodeAvailability = (
  item: BaseItemDto | null | undefined,
  now: Date = new Date(),
): "unaired" | "missing" | null => {
  if (item?.Type !== "Episode" || item.LocationType !== "Virtual") return null;
  const day = airDayKey(item.PremiereDate);
  return day && airDayOffset(day, now) > 0 ? "unaired" : "missing";
};
