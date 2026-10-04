import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import { getServerLocalConfig } from "@/utils/secureCredentials";
import type { ServerProbeOutcome } from "@/utils/serverUrl/types";
import { LocalNetworkSettings } from "./LocalNetworkSettings";

const mockProbe = jest.fn<Promise<ServerProbeOutcome>, [string]>();
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
const mockRefreshUrlState = jest.fn();

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The saved-server store imports the log module, which loads Sentry and its
// timers. Nothing on the path under test logs.
jest.mock("@/utils/log", () => ({ logAndCaptureError: () => undefined }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({
  toast: {
    error: (message: string) => mockToastError(message),
    info: (message: string) => mockToastInfo(message),
    success: () => {},
  },
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
// Input reads the TV font scale through the settings atom, whose module graph
// reaches native modules a spec cannot load. Nothing here renders on TV.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({}),
}));
jest.mock("@/hooks/useWifiSSID", () => ({
  useWifiSSID: () => ({
    permissionStatus: "granted",
    requestPermission: async () => true,
  }),
}));
jest.mock("@/modules/wifi-ssid", () => ({ openLocationSettings: () => {} }));
jest.mock("@/providers/ServerUrlProvider", () => ({
  useServerUrl: () => ({
    isUsingLocalUrl: false,
    currentSSID: "Home",
    connectedToWifi: true,
    refreshUrlState: mockRefreshUrlState,
  }),
}));
jest.mock("@/utils/serverUrl/probes/jellyfin", () => ({
  jellyfinProbe: (url: string) => mockProbe(url),
}));

const REMOTE_URL = "https://jellyfin.example.com";
const PLACEHOLDER = "home.settings.network.local_url_placeholder";
const NOT_SAVED = "home.settings.network.local_url_not_saved";
const UNUSABLE = "home.settings.network.local_url_unusable";
const SAVED_UNANSWERED = "home.settings.network.local_url_saved_unanswered";
const INVALID = "server_url.invalid_url";

/** A signed-in install with auto-switching on and this local URL stored. */
const storedLocalUrl = (localUrl: string) => {
  storage.set("serverUrl", REMOTE_URL);
  storage.set(
    "previousServers",
    JSON.stringify([
      {
        address: REMOTE_URL,
        accounts: [],
        localNetworkConfig: { enabled: true, localUrl, homeWifiSSIDs: [] },
      },
    ]),
  );
};

const savedLocalUrl = () => getServerLocalConfig(REMOTE_URL)?.localUrl;

/** Types an address into the local URL field and leaves the field. */
const enter = async (address: string) => {
  const field = screen.getByPlaceholderText(PLACEHOLDER);
  await fireEvent.changeText(field, address);
  await fireEvent(screen.getByPlaceholderText(PLACEHOLDER), "blur");
};

describe("LocalNetworkSettings", () => {
  beforeEach(() => {
    clearMmkv();
    mockProbe.mockReset();
    mockToastError.mockClear();
    mockToastInfo.mockClear();
    mockRefreshUrlState.mockClear();
  });

  // REACT-NATIVE-6C: a bare address nobody answers at (typed away from home,
  // or without the port the server listens on) was stored as typed. On home
  // Wi-Fi it became the API base path and the app crashed at every launch.
  test.each(["192.168.1.10", "192.168.1.10:8096", "localhost:8096"])(
    "does not save %p when the server does not answer, and says so",
    async (address) => {
      storedLocalUrl("http://10.0.0.2:8096");
      mockProbe.mockResolvedValue({ status: "unreachable" });
      await render(<LocalNetworkSettings />);

      await enter(address);

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(NOT_SAVED),
      );
      expect(savedLocalUrl()).toBe("http://10.0.0.2:8096");
      expect(mockRefreshUrlState).not.toHaveBeenCalled();
    },
  );

  // Return submits and, by dismissing the keyboard, blurs. A failure that came
  // back before that blur had already reopened the field for a retry, so the
  // blur resolved the same address again and the toast showed twice.
  test("says once that an address was not saved when Return also blurs the field", async () => {
    storedLocalUrl("http://10.0.0.2:8096");
    mockProbe.mockResolvedValue({ status: "unreachable" });
    await render(<LocalNetworkSettings />);
    const field = screen.getByPlaceholderText(PLACEHOLDER);

    await fireEvent.changeText(field, "localhost:8096");
    await fireEvent(field, "submitEditing");
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    const probesForOneAttempt = mockProbe.mock.calls.length;
    await fireEvent(field, "blur");

    // A second attempt would have started its probes by now.
    expect(mockProbe).toHaveBeenCalledTimes(probesForOneAttempt);
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  // The other half of the rule above: the server may only have been slow to
  // come up, so leaving the field again without editing it tries once more.
  test("tries an unanswered address again on a later blur", async () => {
    storedLocalUrl("");
    mockProbe.mockResolvedValue({ status: "unreachable" });
    await render(<LocalNetworkSettings />);
    const field = screen.getByPlaceholderText(PLACEHOLDER);

    await fireEvent.changeText(field, "192.168.1.10:8096");
    await fireEvent(field, "submitEditing");
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    await fireEvent(field, "blur");

    mockProbe.mockImplementation(async (url) =>
      url.startsWith("http://") ? { status: "ok" } : { status: "unreachable" },
    );
    await fireEvent(field, "blur");

    await waitFor(() =>
      expect(savedLocalUrl()).toBe("http://192.168.1.10:8096"),
    );
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  test("clears the local URL once when Return also blurs the emptied field", async () => {
    storedLocalUrl("http://10.0.0.2:8096");
    await render(<LocalNetworkSettings />);
    const field = await screen.findByDisplayValue("http://10.0.0.2:8096");

    await fireEvent.changeText(field, "");
    await fireEvent(field, "submitEditing");
    await fireEvent(field, "blur");

    expect(savedLocalUrl()).toBe("");
    expect(mockRefreshUrlState).toHaveBeenCalledTimes(1);
  });

  // A port past 65535 with the scheme typed: nothing could answer there, yet
  // the field read "Server unreachable" and the toast asked for the http://
  // the address already started with.
  test.each(["http://192.168.1.105:80969", "192.168.1.105:80969"])(
    "calls %p invalid instead of unanswered, and does not save it",
    async (address) => {
      storedLocalUrl("http://10.0.0.2:8096");
      mockProbe.mockResolvedValue({ status: "unreachable" });
      await render(<LocalNetworkSettings />);

      await enter(address);

      expect(await screen.findByText(INVALID)).toBeTruthy();
      expect(mockToastError).not.toHaveBeenCalled();
      expect(mockProbe).not.toHaveBeenCalled();
      expect(savedLocalUrl()).toBe("http://10.0.0.2:8096");
    },
  );

  // A local URL is routinely set up from somewhere the server cannot be
  // reached, so an address that says which scheme it means is still kept.
  test("saves an unanswered address that names its scheme, in canonical form", async () => {
    storedLocalUrl("");
    mockProbe.mockResolvedValue({ status: "unreachable" });
    await render(<LocalNetworkSettings />);

    await enter("HTTP://192.168.1.10:8096/");

    await waitFor(() =>
      expect(savedLocalUrl()).toBe("http://192.168.1.10:8096"),
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  // The field keeps saying "Server unreachable" under the address as typed,
  // which read as "not saved" although it was.
  test("says an unanswered address was saved, and shows it as it was stored", async () => {
    storedLocalUrl("");
    mockProbe.mockResolvedValue({ status: "unreachable" });
    await render(<LocalNetworkSettings />);

    await enter("HTTP://192.168.1.10:8096/");

    await waitFor(() =>
      expect(mockToastInfo).toHaveBeenCalledWith(SAVED_UNANSWERED),
    );
    expect(
      await screen.findByDisplayValue("http://192.168.1.10:8096"),
    ).toBeTruthy();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  test("does not repeat that when the same address is committed again", async () => {
    storedLocalUrl("http://192.168.1.10:8096");
    mockProbe.mockResolvedValue({ status: "unreachable" });
    await render(<LocalNetworkSettings />);

    await enter("http://192.168.1.10:8096");

    await waitFor(() => expect(mockProbe).toHaveBeenCalled());
    await waitFor(() => expect(mockRefreshUrlState).toHaveBeenCalled());
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  // The config is written onto the server's entry in the saved list. With no
  // entry nothing is written, so there is nothing to call saved.
  test("does not say saved when the active server has no entry to store it on", async () => {
    storage.set("serverUrl", REMOTE_URL);
    storage.set("previousServers", JSON.stringify([]));
    mockProbe.mockResolvedValue({ status: "unreachable" });
    await render(<LocalNetworkSettings />);
    // No stored config means auto-switching is off and the field is hidden.
    await fireEvent(screen.getByRole("switch"), "valueChange", true);

    await enter("http://192.168.1.10:8096");

    await waitFor(() => expect(mockProbe).toHaveBeenCalled());
    await waitFor(() => expect(mockRefreshUrlState).toHaveBeenCalledTimes(2));
    expect(savedLocalUrl()).toBeUndefined();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  test("says nothing extra when the server answered", async () => {
    storedLocalUrl("");
    mockProbe.mockImplementation(async (url) =>
      url.startsWith("http://") ? { status: "ok" } : { status: "unreachable" },
    );
    await render(<LocalNetworkSettings />);

    await enter("192.168.1.10:8096");

    await waitFor(() =>
      expect(savedLocalUrl()).toBe("http://192.168.1.10:8096"),
    );
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  test("saves a bare address with the scheme the server answered on", async () => {
    storedLocalUrl("");
    mockProbe.mockImplementation(async (url) =>
      url.startsWith("http://") ? { status: "ok" } : { status: "unreachable" },
    );
    await render(<LocalNetworkSettings />);

    await enter("192.168.1.10:8096");

    await waitFor(() =>
      expect(savedLocalUrl()).toBe("http://192.168.1.10:8096"),
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  test("clears the local URL when the field is emptied", async () => {
    storedLocalUrl("http://10.0.0.2:8096");
    await render(<LocalNetworkSettings />);

    await enter("");

    await waitFor(() => expect(savedLocalUrl()).toBe(""));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  // An install that already holds one is switched back to the remote URL by
  // ServerUrlProvider; this is where its owner finds out why.
  test("flags a stored local URL the app cannot use", async () => {
    storedLocalUrl("192.168.1.10:8096");
    await render(<LocalNetworkSettings />);

    expect(await screen.findByText(UNUSABLE)).toBeTruthy();
  });

  test("does not flag a usable or an empty local URL", async () => {
    storedLocalUrl("http://192.168.1.10:8096");
    const view = await render(<LocalNetworkSettings />);
    await screen.findByDisplayValue("http://192.168.1.10:8096");
    expect(screen.queryByText(UNUSABLE)).toBeNull();

    await view.unmount();
    storedLocalUrl("");
    await render(<LocalNetworkSettings />);
    await screen.findByPlaceholderText(PLACEHOLDER);
    expect(screen.queryByText(UNUSABLE)).toBeNull();
  });
});
