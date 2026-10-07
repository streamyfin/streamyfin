import type { Api } from "@jellyfin/sdk";
import { MY_NOTIFICATIONS_PATH } from "@/constants/Notifications";

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

/** What the app sends to replace the person's choices. */
export type MyNotificationsUpdate = {
  pause: NotificationPause | null;
  events: Record<string, boolean>;
  mutedLibraries: string[];
  follow: FollowChoice;
  mutedShows: string[];
};

/** The person's choices in the shape the plugin stores. */
export const toUpdate = (mine: MyNotifications): MyNotificationsUpdate => ({
  pause: mine.pause,
  events: Object.fromEntries(
    mine.events.map((event) => [event.key, event.enabled]),
  ),
  mutedLibraries: mine.libraries
    .filter((library) => !library.enabled)
    .map((library) => library.id),
  follow: mine.follow,
  mutedShows: mine.mutedShows.map((show) => show.id),
});

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

export const withFollow = (
  mine: MyNotifications,
  follow: FollowChoice,
): MyNotifications => ({ ...mine, follow });

export const getMyNotifications = async (api: Api): Promise<MyNotifications> =>
  (await api.get<MyNotifications>(MY_NOTIFICATIONS_PATH)).data;

export const setMyNotifications = async (
  api: Api,
  update: MyNotificationsUpdate,
): Promise<MyNotifications> =>
  (await api.put<MyNotifications>(MY_NOTIFICATIONS_PATH, update)).data;

export const pauseNotifications = async (
  api: Api,
  hours: number | null,
): Promise<MyNotifications> =>
  (
    await api.post<MyNotifications>(`${MY_NOTIFICATIONS_PATH}/pause`, {
      hours,
    })
  ).data;

export const resumeNotifications = async (api: Api): Promise<MyNotifications> =>
  (await api.delete<MyNotifications>(`${MY_NOTIFICATIONS_PATH}/pause`)).data;

// The route takes no body; the show is in the path.
export const muteShow = async (
  api: Api,
  seriesId: string,
): Promise<MyNotifications> =>
  (
    await api.post<MyNotifications>(
      `${MY_NOTIFICATIONS_PATH}/shows/${seriesId}/mute`,
      undefined,
    )
  ).data;

export const unmuteShow = async (
  api: Api,
  seriesId: string,
): Promise<MyNotifications> =>
  (
    await api.delete<MyNotifications>(
      `${MY_NOTIFICATIONS_PATH}/shows/${seriesId}/mute`,
    )
  ).data;
