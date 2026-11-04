import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

import { homeNetworkConfig, isOnHomeNetwork } from "./homeNetwork";

const REMOTE = "https://jellyfin.example";
const LOCAL = "http://192.168.1.10:8096";

const setUpHomeNetwork = (
  config: Partial<{
    localUrl: string;
    homeWifiSSIDs: string[];
    enabled: boolean;
  }> = {},
) => {
  storage.set("serverUrl", REMOTE);
  storage.set(
    "previousServers",
    JSON.stringify([
      {
        address: REMOTE,
        accounts: [],
        localNetworkConfig: {
          localUrl: LOCAL,
          homeWifiSSIDs: ["Home"],
          enabled: true,
          ...config,
        },
      },
    ]),
  );
};

beforeEach(clearMmkv);

describe("home network", () => {
  test("is the local network set up for the signed-in server", () => {
    setUpHomeNetwork();
    expect(homeNetworkConfig()?.localUrl).toBe(LOCAL);
  });

  test("is not set up while switching to the local address is off", () => {
    setUpHomeNetwork({ enabled: false });
    expect(homeNetworkConfig()).toBeNull();
  });

  test("is not set up without a home Wi-Fi to switch on", () => {
    setUpHomeNetwork({ homeWifiSSIDs: [] });
    expect(homeNetworkConfig()).toBeNull();
  });

  // The app never switches to an address it cannot use.
  test("is not set up with a local address the app would not use", () => {
    setUpHomeNetwork({ localUrl: "192.168.1.10:8096" });
    expect(homeNetworkConfig()).toBeNull();
  });

  test("is where the app talks to the server's local address", () => {
    setUpHomeNetwork();
    expect(isOnHomeNetwork({ basePath: LOCAL })).toBe(true);
    expect(isOnHomeNetwork({ basePath: `${LOCAL}/` })).toBe(true);
    expect(isOnHomeNetwork({ basePath: REMOTE })).toBe(false);
  });

  test("is nowhere while none is set up", () => {
    expect(isOnHomeNetwork({ basePath: LOCAL })).toBe(false);
  });
});
