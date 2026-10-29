import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactNode } from "react";
import { Linking } from "react-native";
import { CustomLinksGroup } from "@/components/more/CustomLinksGroup";
import { useMenuLinks } from "@/hooks/useMenuLinks";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import { isMenuLink, type MenuLink } from "@/utils/customLinks";

const mockMenuLinks = jest.fn<MenuLink[], []>();
const mockGetConfig = jest.fn(async (_url: string) => ({
  data: { menuLinks: mockMenuLinks() },
}));
const mockOpenBrowser = jest.fn<Promise<{ type: string }>, [string]>();
const mockToastError = jest.fn();

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));
// The provider's module graph is the whole app. The menu only reads the
// links out of the server's web config.
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({
      basePath: "https://jellyfin.example.com",
      axiosInstance: {
        get: (url: string) => mockGetConfig(url),
      },
    }),
  };
});

const NOT_OPENED = "custom_links.could_not_open_link";
const COLD_START_TIMEOUT_MS = 60_000;

/**
 * Renders the menu's links with one link and taps it. The address is whatever
 * the server's config holds, which nothing has checked to be a string.
 */
const tapLink = async (url: unknown) => {
  mockMenuLinks.mockReturnValue([
    { name: "My link", url, icon: "link" } as MenuLink,
  ]);
  await render(<CustomLinksGroup />, { wrapper: QueryWrapper });
  await fireEvent.press(await screen.findByText("My link"));
};

describe("custom links", () => {
  let openURL: jest.SpyInstance<Promise<unknown>, [string]>;

  // The first render pays for loading React Native's components, which has
  // gone past the 5 s a test gets on a cold cache. See LocalNetworkSettings.
  beforeAll(async () => {
    mockMenuLinks.mockReturnValue([]);
    const view = await render(<CustomLinksGroup />, { wrapper: QueryWrapper });
    await waitFor(() => expect(mockMenuLinks).toHaveBeenCalled());
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
    openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
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

  // A server whose admin listed none shows no Custom links group at all.
  it("shows nothing when the server lists no links", async () => {
    mockMenuLinks.mockReturnValue([]);
    const view = await render(<CustomLinksGroup />, { wrapper: QueryWrapper });

    await waitFor(() => expect(mockMenuLinks).toHaveBeenCalled());
    // Let the answer reach the group before looking for its title.
    await new Promise((resolve) => setImmediate(resolve));
    expect(screen.queryByText("tabs.custom_links")).toBeNull();
    await view.unmount();
  });

  // The config is JSON the admin edits by hand: an entry that is not an
  // object, or has no name to show, has no row to draw. Reading its name
  // threw while the More screen rendered.
  it("draws a row for each named link and skips the rest", async () => {
    // What the server's JSON can hold, whatever the type says.
    mockMenuLinks.mockReturnValue([
      null,
      "https://example.com",
      { url: "https://example.com/unnamed" },
      { name: "Status", url: "https://example.com/status", icon: "link" },
    ] as unknown as MenuLink[]);
    const view = await render(<CustomLinksGroup />, { wrapper: QueryWrapper });

    expect(await screen.findByText("Status")).toBeTruthy();
    await view.unmount();
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

describe("isMenuLink", () => {
  it("keeps an entry with a name to show", () => {
    expect(isMenuLink({ name: "Status", url: "https://example.com" })).toBe(
      true,
    );
    // The address is checked when the link is opened, not here.
    expect(isMenuLink({ name: "Status" })).toBe(true);
  });

  it("drops what has no name to show", () => {
    for (const entry of [
      null,
      undefined,
      "https://example.com",
      { url: "https://example.com" },
      { name: 3, url: "https://example.com" },
    ]) {
      expect(isMenuLink(entry)).toBe(false);
    }
  });
});

describe("useMenuLinks", () => {
  const httpError = (status: number) =>
    new AxiosError(
      `Request failed with status code ${status}`,
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      { status, data: "", headers: {}, config: {} } as AxiosResponse,
    );

  /** The app's retry policy and error reporting, with no delay between tries. */
  const renderMenuLinks = (onError: jest.Mock) => {
    const client = new QueryClient({
      queryCache: new QueryCache({ onError }),
      defaultOptions: {
        queries: {
          retry: (failureCount) => failureCount < 3,
          retryDelay: 0,
          // No garbage collection timer left behind to keep the worker alive.
          gcTime: Number.POSITIVE_INFINITY,
        },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useMenuLinks(), { wrapper });
  };

  beforeEach(() => {
    mockGetConfig.mockReset().mockImplementation(async () => ({
      data: { menuLinks: mockMenuLinks() },
    }));
  });

  // A server with its web client turned off (hostwebclient=false) has no
  // config.json. The request was retried three times and each opening of
  // More sent a Sentry event; the custom links page it replaced caught it.
  it("gives no links, once and without an error, when the server has no web config", async () => {
    mockGetConfig.mockRejectedValue(httpError(404));
    const onError = jest.fn();

    const { result } = await renderMenuLinks(onError);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(mockGetConfig).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("still fails on any other error", async () => {
    mockGetConfig.mockRejectedValue(httpError(500));
    const onError = jest.fn();

    const { result } = await renderMenuLinks(onError);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockGetConfig).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
