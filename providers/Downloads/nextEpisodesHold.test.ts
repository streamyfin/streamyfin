import type { NetInfoState } from "@react-native-community/netinfo";
import { networkHold } from "./nextEpisodesHold";

const connection = (type: string) =>
  ({ isConnected: true, type, details: null }) as unknown as NetInfoState;
const WIFI = connection("wifi");
const CELLULAR = connection("cellular");

describe("networkHold", () => {
  test("lets any network download", () => {
    expect(networkHold("any", CELLULAR, false)).toBeNull();
  });

  test("waits for Wi-Fi on mobile data", () => {
    expect(networkHold("wifi", CELLULAR, false)).toBe("waiting_for_wifi");
    expect(networkHold("wifi", WIFI, false)).toBeNull();
  });

  // Any other Wi-Fi, a hotel's or a friend's, goes through the remote address.
  test("waits for the home network on any other connection", () => {
    expect(networkHold("home", WIFI, false)).toBe("waiting_for_home_network");
    expect(networkHold("home", CELLULAR, false)).toBe(
      "waiting_for_home_network",
    );
    expect(networkHold("home", WIFI, true)).toBeNull();
  });
});
