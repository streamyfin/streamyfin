import {
  createNotificationChannels,
  NOTIFICATION_CHANNELS,
} from "./notificationChannels";

describe("the Android channels", () => {
  test("are the plugin's four families, each with a name the person reads", async () => {
    const setNotificationChannelAsync = jest.fn();

    await createNotificationChannels(
      {
        setNotificationChannelAsync,
        AndroidImportance: { DEFAULT: 3, HIGH: 4 },
      },
      (key: string) => key,
    );

    expect(NOTIFICATION_CHANNELS.map((channel) => channel.id)).toEqual([
      "new-content",
      "requests",
      "account",
      "server-alerts",
    ]);
    expect(setNotificationChannelAsync).toHaveBeenCalledTimes(4);
    expect(setNotificationChannelAsync).toHaveBeenCalledWith(
      "server-alerts",
      expect.objectContaining({
        name: "home.settings.notifications.channels.server_alerts",
      }),
    );
  });

  // An administrator is told each time someone signs in or starts playing, many times a day:
  // a banner with a sound each time is too loud, and once the channel exists only the person
  // can lower it. What rings is the person's own account getting locked.
  test("ring for the person's own account only", async () => {
    const setNotificationChannelAsync = jest.fn();

    await createNotificationChannels(
      {
        setNotificationChannelAsync,
        AndroidImportance: { DEFAULT: 3, HIGH: 4 },
      },
      (key: string) => key,
    );

    expect(
      Object.fromEntries(
        setNotificationChannelAsync.mock.calls.map(([id, channel]) => [
          id,
          channel.importance,
        ]),
      ),
    ).toEqual({
      "new-content": 3,
      requests: 3,
      account: 4,
      "server-alerts": 3,
    });
  });
});
