import { MY_NOTIFICATIONS_PATH } from "@/constants/Notifications";
import {
  getMyNotifications,
  type MyNotifications,
  muteShow,
  pauseNotifications,
  resumeNotifications,
  setMyNotifications,
  toUpdate,
  unmuteShow,
  withEvent,
  withFollow,
  withLibrary,
} from "./notificationPreferences";

const mine: MyNotifications = {
  pause: null,
  events: [
    { key: "itemAdded", family: "new-content", enabled: true },
    { key: "seerrRequests", family: "requests", enabled: false },
  ],
  libraries: [
    { id: "movies", name: "Movies", enabled: true },
    { id: "music", name: "Music videos", enabled: false },
  ],
  follow: { favorites: true, started: false },
  mutedShows: [{ id: "bear", name: "The Bear" }],
};

describe("a person's notification choices", () => {
  it("are sent back in the shape the plugin stores", () => {
    expect(toUpdate(mine)).toEqual({
      pause: null,
      events: { itemAdded: true, seerrRequests: false },
      mutedLibraries: ["music"],
      follow: { favorites: true, started: false },
      mutedShows: ["bear"],
    });
  });

  it("change one event without touching the rest", () => {
    const changed = withEvent(mine, "itemAdded", false);

    expect(changed.events[0].enabled).toBe(false);
    expect(changed.events[1].enabled).toBe(false);
    expect(mine.events[0].enabled).toBe(true);
  });

  it("change one library", () => {
    expect(withLibrary(mine, "music", true).libraries[1].enabled).toBe(true);
  });

  it("change which shows count as followed", () => {
    expect(
      withFollow(mine, { favorites: false, started: true }).follow,
    ).toEqual({
      favorites: false,
      started: true,
    });
  });
});

describe("the plugin's routes for a person's choices", () => {
  const answer = { data: mine };
  const api = {
    get: jest.fn().mockResolvedValue(answer),
    put: jest.fn().mockResolvedValue(answer),
    post: jest.fn().mockResolvedValue(answer),
    delete: jest.fn().mockResolvedValue(answer),
  };
  const client = api as never;

  beforeEach(() => jest.clearAllMocks());

  it("read and replace the choices", async () => {
    expect(await getMyNotifications(client)).toBe(mine);
    await setMyNotifications(client, toUpdate(mine));

    expect(api.get).toHaveBeenCalledWith(MY_NOTIFICATIONS_PATH);
    expect(api.put).toHaveBeenCalledWith(MY_NOTIFICATIONS_PATH, toUpdate(mine));
  });

  it("pause for some hours, or until turned back on, and lift it", async () => {
    await pauseNotifications(client, 8);
    await pauseNotifications(client, null);
    await resumeNotifications(client);

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      `${MY_NOTIFICATIONS_PATH}/pause`,
      { hours: 8 },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      `${MY_NOTIFICATIONS_PATH}/pause`,
      { hours: null },
    );
    expect(api.delete).toHaveBeenCalledWith(`${MY_NOTIFICATIONS_PATH}/pause`);
  });

  it("put a show id in the path as one part of it", async () => {
    await muteShow(client, "a/../b?c");
    await unmuteShow(client, "a/../b?c");

    expect(api.post).toHaveBeenCalledWith(
      `${MY_NOTIFICATIONS_PATH}/shows/a%2F..%2Fb%3Fc/mute`,
      undefined,
    );
    expect(api.delete).toHaveBeenCalledWith(
      `${MY_NOTIFICATIONS_PATH}/shows/a%2F..%2Fb%3Fc/mute`,
    );
  });

  it("turn a show off and back on", async () => {
    await muteShow(client, "bear");
    await unmuteShow(client, "bear");

    expect(api.post).toHaveBeenCalledWith(
      `${MY_NOTIFICATIONS_PATH}/shows/bear/mute`,
      undefined,
    );
    expect(api.delete).toHaveBeenCalledWith(
      `${MY_NOTIFICATIONS_PATH}/shows/bear/mute`,
    );
  });
});
