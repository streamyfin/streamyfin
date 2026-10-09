import {
  handleNotificationAction,
  registerNotificationCategories,
} from "./notificationActions";

jest.mock("./notificationPreferences", () => ({
  pauseNotifications: jest.fn().mockResolvedValue({}),
  muteShow: jest.fn().mockResolvedValue({}),
}));

const { pauseNotifications, muteShow } = jest.requireMock(
  "./notificationPreferences",
);
const api = {} as never;
const response = (
  actionIdentifier: string,
  data: Record<string, unknown> = {},
) =>
  ({
    actionIdentifier,
    notification: { request: { content: { data } } },
  }) as never;

describe("a notification's buttons", () => {
  beforeEach(() => jest.clearAllMocks());

  test("pause everything for eight hours", async () => {
    expect(await handleNotificationAction(response("pause"), api)).toBe(
      "paused",
    );
    expect(pauseNotifications).toHaveBeenCalledWith(api, 8);
  });

  test("turn the show off", async () => {
    expect(
      await handleNotificationAction(
        response("muteShow", { seriesId: "9bd5926326d651153928e0d11c6ee7cb" }),
        api,
      ),
    ).toBe("muted");
    expect(muteShow).toHaveBeenCalledWith(
      api,
      "9bd5926326d651153928e0d11c6ee7cb",
    );
  });

  // The data of a notification is not the server's word: anyone with the device's push token
  // can send one, and a show id built as a path would send the button to another route.
  test.each([
    "../../../../System/Restart",
    "9bd5926326d651153928e0d11c6ee7cb/../../Users",
    "show?x=",
  ])("do nothing with a show id that is not an id: %s", async (seriesId) => {
    expect(
      await handleNotificationAction(response("muteShow", { seriesId }), api),
    ).toBeNull();
    expect(muteShow).not.toHaveBeenCalled();
  });

  // A message from a plugin that sends no show id does nothing.
  test("do nothing without the show", async () => {
    expect(
      await handleNotificationAction(response("muteShow"), api),
    ).toBeNull();
    expect(muteShow).not.toHaveBeenCalled();
  });

  test("leave a plain tap to the route it opens", async () => {
    expect(
      await handleNotificationAction(
        response("expo.modules.notifications.actions.DEFAULT"),
        api,
      ),
    ).toBeNull();
    expect(pauseNotifications).not.toHaveBeenCalled();
  });

  test("are declared per category the plugin names, opening the app", async () => {
    const setNotificationCategoryAsync = jest.fn();

    await registerNotificationCategories(
      { setNotificationCategoryAsync },
      (key: string) => key,
    );

    expect(setNotificationCategoryAsync).toHaveBeenCalledWith("episode", [
      expect.objectContaining({
        identifier: "pause",
        options: { opensAppToForeground: true },
      }),
      expect.objectContaining({
        identifier: "muteShow",
        buttonTitle: "home.settings.notifications.actions.mute_show",
      }),
    ]);
    expect(setNotificationCategoryAsync).toHaveBeenCalledWith("general", [
      expect.objectContaining({ identifier: "pause" }),
    ]);
  });
});
