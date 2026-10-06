import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Linking } from "react-native";
import CustomLinksPage, {
  type MenuLink,
} from "@/app/(auth)/(tabs)/(custom-links)/index";

const mockMenuLinks = jest.fn<MenuLink[], []>();
const mockOpenBrowser = jest.fn<Promise<{ type: string }>, [string]>();
const mockToastError = jest.fn();

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));
// The provider's module graph is the whole app. The screen only reads the
// links out of the server's web config.
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({
      basePath: "https://jellyfin.example.com",
      axiosInstance: {
        get: async () => ({ data: { menuLinks: mockMenuLinks() } }),
      },
    }),
  };
});

const NOT_OPENED = "custom_links.could_not_open_link";
const COLD_START_TIMEOUT_MS = 60_000;

/**
 * Renders the screen with one link and taps it. The address is whatever the
 * server's config holds, which nothing has checked to be a string.
 */
const tapLink = async (url: unknown) => {
  mockMenuLinks.mockReturnValue([
    { name: "My link", url, icon: "link" } as MenuLink,
  ]);
  await render(<CustomLinksPage />);
  await fireEvent.press(await screen.findByText("My link"));
};

describe("custom links", () => {
  let openURL: jest.SpyInstance<Promise<unknown>, [string]>;

  // The first render pays for loading React Native's components, which has
  // gone past the 5 s a test gets on a cold cache. See LocalNetworkSettings.
  beforeAll(async () => {
    mockMenuLinks.mockReturnValue([]);
    const view = await render(<CustomLinksPage />);
    await screen.findByText("custom_links.no_links");
    await view.unmount();
  }, COLD_START_TIMEOUT_MS);

  beforeEach(() => {
    mockToastError.mockReset();
    // What iOS does: the in-app browser takes http and https and rejects the
    // rest, the way Sentry REACT-NATIVE-CE reports it.
    mockOpenBrowser.mockReset().mockImplementation(async (url) => {
      if (/^https?:\/\/\S+$/.test(url)) return { type: "opened" };
      throw new Error(
        "FunctionCallException: Calling the 'openBrowserAsync' function has failed",
      );
    });
    openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  afterEach(() => {
    openURL.mockRestore();
  });

  it("opens a web link in the in-app browser", async () => {
    await tapLink("https://example.com/status");

    await waitFor(() =>
      expect(mockOpenBrowser).toHaveBeenCalledWith(
        "https://example.com/status",
      ),
    );
    expect(openURL).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  // Sentry REACT-NATIVE-CE: the address is whatever the admin typed, and one
  // without a scheme was handed to the in-app browser, whose rejection nothing
  // caught. The tap did nothing at all.
  it("says so when a link has no scheme, without guessing one", async () => {
    await tapLink("example.com/status");

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(NOT_OPENED),
    );
    expect(mockOpenBrowser).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });

  // The config is JSON the admin edits by hand. An entry with no address, or
  // one that is not text, threw before anything was caught and left the same
  // unhandled rejection behind.
  it.each([
    ["is missing", undefined],
    ["is empty", ""],
    ["is not text", 8096],
  ])("says so when a link's address %s", async (_case, url) => {
    await tapLink(url);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(NOT_OPENED),
    );
    expect(mockOpenBrowser).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("hands a link with an app scheme to the system", async () => {
    await tapLink("vlc://example.com/stream.m3u8");

    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith("vlc://example.com/stream.m3u8"),
    );
    expect(mockOpenBrowser).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("says so when nothing on the device opens the link", async () => {
    openURL.mockRejectedValue(new Error("Unable to open URL"));

    await tapLink("vlc://example.com/stream.m3u8");

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(NOT_OPENED),
    );
  });

  // A host and port with the scheme left off parses as a scheme of its own
  // ("localhost:"). Nothing is registered for it, so it ends in the message.
  it("says so for a host and port with no scheme", async () => {
    openURL.mockRejectedValue(new Error("Unable to open URL"));

    await tapLink("localhost:8096/web");

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(NOT_OPENED),
    );
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });

  it("falls back to the system when the in-app browser refuses a web link", async () => {
    mockOpenBrowser.mockRejectedValue(new Error("No matching activity"));

    await tapLink("https://example.com/status");

    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith("https://example.com/status"),
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("says so when neither the in-app browser nor the system opens a web link", async () => {
    openURL.mockRejectedValue(new Error("Unable to open URL"));

    await tapLink("https://exa mple.com");

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(NOT_OPENED),
    );
  });

  it("ignores the spaces around an address", async () => {
    await tapLink("  https://example.com/status ");

    await waitFor(() =>
      expect(mockOpenBrowser).toHaveBeenCalledWith(
        "https://example.com/status",
      ),
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
