import type { Api } from "@jellyfin/sdk";
import {
  MY_NOTIFICATIONS_PATH,
  MY_NOTIFICATIONS_QUERY,
} from "@/constants/Notifications";

/** A pause of every notification; no end means until it is turned back on. */
export type NotificationPause = { until?: string | null };

/** Which shows count as followed. */
export type FollowChoice = { favorites: boolean; started: boolean };

/** One event that can reach the person. */
export type MyEvent = { key: string; family: string; enabled: boolean };

/** One library the person can open. */
export type MyLibrary = { id: string; name: string; enabled: boolean };

/** A show the person turned off. */
export type MyShow = { id: string; name: string };

/** What reaches the person and what they kept of it, as the plugin describes it. */
export type MyNotifications = {
  pause: NotificationPause | null;
  events: MyEvent[];
  libraries: MyLibrary[];
  follow: FollowChoice;
  mutedShows: MyShow[];
};

/**
 * What the app sends to replace the choices its screen edits. The pause and the muted shows
 * have routes of their own, which the plugin keeps apart from this.
 */
export type MyNotificationsUpdate = {
  events: Record<string, boolean>;
  mutedLibraries: string[];
  follow: FollowChoice;
};

/** Where the cache keeps a person's choices on a server. */
export const myNotificationsKey = (basePath?: string, userId?: string) =>
  [MY_NOTIFICATIONS_QUERY, basePath, userId] as const;

/** The choices the screen edits, in the shape the plugin stores. */
export const toUpdate = (mine: MyNotifications): MyNotificationsUpdate => ({
  events: Object.fromEntries(
    mine.events.map((event) => [event.key, event.enabled]),
  ),
  mutedLibraries: mine.libraries
    .filter((library) => !library.enabled)
    .map((library) => library.id),
  follow: mine.follow,
});

/** The choices with one event kept or turned off. */
export const withEvent = (
  mine: MyNotifications,
  key: string,
  enabled: boolean,
): MyNotifications => ({
  ...mine,
  events: mine.events.map((event) =>
    event.key === key ? { ...event, enabled } : event,
  ),
});

/** The choices with one library's new items kept or turned off. */
export const withLibrary = (
  mine: MyNotifications,
  id: string,
  enabled: boolean,
): MyNotifications => ({
  ...mine,
  libraries: mine.libraries.map((library) =>
    library.id === id ? { ...library, enabled } : library,
  ),
});

/** The choices with which shows count as followed. */
export const withFollow = (
  mine: MyNotifications,
  follow: FollowChoice,
): MyNotifications => ({ ...mine, follow });

/** Reads the person's choices, as the plugin describes them. */
export const getMyNotifications = async (api: Api): Promise<MyNotifications> =>
  (await api.get<MyNotifications>(MY_NOTIFICATIONS_PATH)).data;

/** Replaces the choices the screen edits, and answers with all of them. */
export const setMyNotifications = async (
  api: Api,
  update: MyNotificationsUpdate,
): Promise<MyNotifications> =>
  (await api.put<MyNotifications>(MY_NOTIFICATIONS_PATH, update)).data;

/** Pauses every notification for some hours, or until turned back on with `null`. */
export const pauseNotifications = async (
  api: Api,
  hours: number | null,
): Promise<MyNotifications> =>
  (
    await api.post<MyNotifications>(`${MY_NOTIFICATIONS_PATH}/pause`, {
      hours,
    })
  ).data;

/** Lifts the pause. */
export const resumeNotifications = async (api: Api): Promise<MyNotifications> =>
  (await api.delete<MyNotifications>(`${MY_NOTIFICATIONS_PATH}/pause`)).data;

// The show's route, with its id as one part of the path whatever it holds.
const showMutePath = (seriesId: string): string =>
  `${MY_NOTIFICATIONS_PATH}/shows/${encodeURIComponent(seriesId)}/mute`;

/** Turns one show's new episodes off. The route takes no body; the show is in the path. */
export const muteShow = async (
  api: Api,
  seriesId: string,
): Promise<MyNotifications> =>
  (await api.post<MyNotifications>(showMutePath(seriesId), undefined)).data;

/** Turns a show turned off back on. */
export const unmuteShow = async (
  api: Api,
  seriesId: string,
): Promise<MyNotifications> =>
  (await api.delete<MyNotifications>(showMutePath(seriesId))).data;
