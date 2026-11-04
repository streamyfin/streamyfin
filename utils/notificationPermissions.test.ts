import {
  NOTIFICATION_PERMISSIONS,
  SETTINGS_LINK_ASKED_KEY,
} from "@/constants/Notifications";
import { offerSettingsLinkOnce } from "./notificationPermissions";

const mockWarnings: string[] = [];
jest.mock("@/utils/log", () => ({
  writeToLog: (level: string, message: string) =>
    void mockWarnings.push(`${level} ${message}`),
}));

const memory = () => {
  const values = new Map<string, string>();
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("the link in the iOS Settings", () => {
  // Asked again at every start, it cost a call to iOS each time for nothing.
  it("is asked for once per install", async () => {
    const requestPermissionsAsync = jest.fn().mockResolvedValue({});
    const store = memory();

    await offerSettingsLinkOnce({ requestPermissionsAsync }, store);
    await offerSettingsLinkOnce({ requestPermissionsAsync }, store);

    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(requestPermissionsAsync).toHaveBeenCalledWith(
      NOTIFICATION_PERMISSIONS,
    );
  });

  // Asked when notifications are already allowed, for the link alone. iOS refusing the
  // request must not cost the push registration that comes after it at every start.
  it("lets the start go on when iOS refuses the request, and asks again next time", async () => {
    const requestPermissionsAsync = jest
      .fn()
      .mockRejectedValue(new Error("Unexpected permission result type"));
    const store = memory();

    await expect(
      offerSettingsLinkOnce({ requestPermissionsAsync }, store),
    ).resolves.toBeUndefined();

    expect(store.getString(SETTINGS_LINK_ASKED_KEY)).toBeUndefined();
    expect(mockWarnings).toEqual([expect.stringContaining("WARN")]);
  });
});
