import { act, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Text } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import type { LocalNetworkConfig } from "@/utils/secureCredentials";
import { ServerUrlProvider, useServerUrl } from "./ServerUrlProvider";

const mockSwitchServerUrl = jest.fn();

jest.mock("@/hooks/useWifiSSID", () => ({
  useWifiSSID: () => ({
    ssid: "Home",
    connectedToWifi: true,
    permissionStatus: "granted",
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest
    .requireActual("jotai")
    .atom({ basePath: "https://jellyfin.example.com" }),
  useJellyfin: () => ({ switchServerUrl: mockSwitchServerUrl }),
}));

const REMOTE_URL = "https://jellyfin.example.com";
const LOCAL_URL = "http://192.168.1.10:8096";

const store = getDefaultStore();
const apiOn = (basePath: string) => store.set(apiAtom, { basePath } as never);

/** A signed-in install whose server has this LAN config, on its home Wi-Fi. */
const atHomeWith = (localNetworkConfig: LocalNetworkConfig) => {
  storage.set("serverUrl", REMOTE_URL);
  storage.set(
    "previousServers",
    JSON.stringify([{ address: REMOTE_URL, accounts: [], localNetworkConfig }]),
  );
};

const UrlInUse = () => (
  <Text>{useServerUrl().isUsingLocalUrl ? "local" : "remote"}</Text>
);

/** Mounts the provider and lets the SSID debounce run out. */
const settle = async () => {
  await render(
    <ServerUrlProvider>
      <UrlInUse />
    </ServerUrlProvider>,
  );
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
};

describe("ServerUrlProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearMmkv();
    mockSwitchServerUrl.mockReset();
    // The real switch replaces the api, which is what the next evaluation reads.
    mockSwitchServerUrl.mockImplementation(apiOn);
    apiOn(REMOTE_URL);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("switches to the local URL on a home Wi-Fi network", async () => {
    atHomeWith({
      enabled: true,
      localUrl: "http://192.168.1.10:8096",
      homeWifiSSIDs: ["Home"],
    });

    await settle();

    expect(mockSwitchServerUrl).toHaveBeenLastCalledWith(
      "http://192.168.1.10:8096",
    );
    expect(screen.getByText("local")).toBeTruthy();
  });

  // REACT-NATIVE-6C: installs already hold a local address saved without its
  // scheme. Switching to it made it the API base path, which nothing can
  // parse, and the app crashed at every launch on home Wi-Fi.
  test.each(["192.168.1.10", "192.168.1.10:8096", "localhost:8096"])(
    "stays on the remote URL when the stored local URL is %p",
    async (localUrl) => {
      atHomeWith({ enabled: true, localUrl, homeWifiSSIDs: ["Home"] });

      await settle();

      expect(mockSwitchServerUrl).not.toHaveBeenCalled();
      expect(screen.getByText("remote")).toBeTruthy();
    },
  );

  // A server saved under /emby moves to its root address while the app runs,
  // possibly on the local address, so the api does not change with it. The
  // address remembered from the last api change is then the dead one, and
  // going back to it away from home would fail every request.
  test("goes back to the remote address storage holds now", async () => {
    const legacyUrl = `${REMOTE_URL}/emby`;
    const away = {
      enabled: true,
      localUrl: "http://192.168.1.10:8096",
      homeWifiSSIDs: ["Elsewhere"],
    };
    storage.set("serverUrl", legacyUrl);
    storage.set(
      "previousServers",
      JSON.stringify([
        { address: legacyUrl, accounts: [], localNetworkConfig: away },
      ]),
    );
    let refresh = () => {};
    const Refresher = () => {
      refresh = useServerUrl().refreshUrlState;
      return null;
    };
    await render(
      <ServerUrlProvider>
        <Refresher />
      </ServerUrlProvider>,
    );
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(mockSwitchServerUrl).toHaveBeenLastCalledWith(legacyUrl);

    storage.set("serverUrl", REMOTE_URL);
    storage.set(
      "previousServers",
      JSON.stringify([
        { address: REMOTE_URL, accounts: [], localNetworkConfig: away },
      ]),
    );
    await act(async () => refresh());

    expect(mockSwitchServerUrl).toHaveBeenLastCalledWith(REMOTE_URL);
  });

  test("stays on the remote URL away from home", async () => {
    atHomeWith({
      enabled: true,
      localUrl: "http://192.168.1.10:8096",
      homeWifiSSIDs: ["Elsewhere"],
    });

    await settle();

    expect(mockSwitchServerUrl).not.toHaveBeenCalled();
    expect(screen.getByText("remote")).toBeTruthy();
  });

  // Each switch builds a new api, which closes and reopens the WebSocket and
  // posts the capabilities again, for an address the api already has.
  test("keeps the api when it is already on the local URL", async () => {
    apiOn(LOCAL_URL);
    atHomeWith({
      enabled: true,
      localUrl: LOCAL_URL,
      homeWifiSSIDs: ["Home"],
    });

    await settle();

    expect(mockSwitchServerUrl).not.toHaveBeenCalled();
    expect(screen.getByText("local")).toBeTruthy();
  });

  // The api drops one trailing slash from its base path.
  test("keeps the api when storage holds the same URL with a trailing slash", async () => {
    storage.set("serverUrl", `${REMOTE_URL}/`);

    await settle();

    expect(mockSwitchServerUrl).not.toHaveBeenCalled();
  });

  test("leaves the local URL for the remote one when Wi-Fi is not home", async () => {
    apiOn(LOCAL_URL);
    atHomeWith({
      enabled: true,
      localUrl: LOCAL_URL,
      homeWifiSSIDs: ["Elsewhere"],
    });

    await settle();

    expect(mockSwitchServerUrl).toHaveBeenCalledTimes(1);
    expect(mockSwitchServerUrl).toHaveBeenLastCalledWith(REMOTE_URL);
    expect(screen.getByText("remote")).toBeTruthy();
  });
});
