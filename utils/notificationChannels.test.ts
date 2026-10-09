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
        importance: 4,
      }),
    );
    expect(setNotificationChannelAsync).toHaveBeenCalledWith(
      "new-content",
      expect.objectContaining({ importance: 3 }),
    );
  });
});
