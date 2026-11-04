import type { NetInfoState } from "@react-native-community/netinfo";
import { networkHold } from "./nextEpisodesHold";

const connection = (type: string) =>
  ({ isConnected: true, type, details: null }) as unknown as NetInfoState;
const WIFI = connection("wifi");
const CELLULAR = connection("cellular");

const AWAY = { setUp: true, on: false };
const HOME = { setUp: true, on: true };
const NOT_SET_UP = { setUp: false, on: false };

describe("networkHold", () => {
  test("lets any network download", () => {
    expect(networkHold("any", CELLULAR, NOT_SET_UP)).toBeNull();
  });

  test("waits for Wi-Fi on mobile data", () => {
    expect(networkHold("wifi", CELLULAR, NOT_SET_UP)).toBe("waiting_for_wifi");
    expect(networkHold("wifi", WIFI, NOT_SET_UP)).toBeNull();
  });

  // Any other Wi-Fi, a hotel's or a friend's, goes through the remote address.
  test("waits for the home network on any other connection", () => {
    expect(networkHold("home", WIFI, AWAY)).toBe("waiting_for_home_network");
    expect(networkHold("home", CELLULAR, AWAY)).toBe(
      "waiting_for_home_network",
    );
    expect(networkHold("home", WIFI, HOME)).toBeNull();
  });

  // A server admin can set it on a device with no home network set up. It
  // never falls back to Wi-Fi: the remote connection is what it rules out.
  test("says the home network is not set up rather than waiting for it", () => {
    expect(networkHold("home", WIFI, NOT_SET_UP)).toBe(
      "home_network_not_set_up",
    );
  });
});
