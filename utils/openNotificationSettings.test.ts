import { Linking } from "react-native";
import { openNotificationSettings } from "./openNotificationSettings";

jest.mock("expo-application", () => ({
  applicationId: "com.fredrikburmester.streamyfin",
}));

describe("opening the phone's notification settings", () => {
  const sendIntent = jest.spyOn(Linking, "sendIntent");
  const openSettings = jest.spyOn(Linking, "openSettings");

  beforeEach(() => {
    jest.clearAllMocks();
    openSettings.mockResolvedValue(undefined as never);
  });

  // Straight to the app's notifications, where each channel is tuned.
  test("goes to the app's notification settings on Android", async () => {
    sendIntent.mockResolvedValue(undefined as never);

    await openNotificationSettings("android");

    expect(sendIntent).toHaveBeenCalledWith(
      "android.settings.APP_NOTIFICATION_SETTINGS",
      [
        {
          key: "android.provider.extra.APP_PACKAGE",
          value: "com.fredrikburmester.streamyfin",
        },
      ],
    );
    expect(openSettings).not.toHaveBeenCalled();
  });

  test("falls back to the app's settings when Android refuses", async () => {
    sendIntent.mockRejectedValue(new Error("no activity"));

    await openNotificationSettings("android");

    expect(openSettings).toHaveBeenCalled();
  });

  test("opens the app's settings on iOS", async () => {
    await openNotificationSettings("ios");

    expect(sendIntent).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalled();
  });
});
