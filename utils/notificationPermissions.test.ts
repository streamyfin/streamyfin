import { NOTIFICATION_PERMISSIONS } from "@/constants/Notifications";
import { offerSettingsLinkOnce } from "./notificationPermissions";

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
});
