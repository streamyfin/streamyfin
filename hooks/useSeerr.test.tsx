import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import type React from "react";
import { DiscoverSliderType } from "@/utils/seerr/types";
import {
  Endpoints,
  SeerrApi,
  seerrPublicSettingsQuery,
  useSeerrImageCache,
} from "./useSeerr";

// Ships as ES modules, which Jest does not load.
jest.mock("sonner-native", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));
// The real log loads Sentry, whose timers keep Jest from exiting.
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
  writeErrorLog: jest.fn(),
}));
// The settings atom imports the screens that edit it; the client reads none.

const mockWriteToLog = jest.fn();
const mockToastError = jest.fn();

beforeEach(() => {
  mockWriteToLog.mockClear();
  mockToastError.mockClear();
});

// A Seerr that answers 200 with `body`, as the wire carries it: axios parses
// it, and hands back a string it could not parse as it came.
const answering = (body: string) => {
  const api = new SeerrApi("https://seerr.example");
  const adapter: AxiosAdapter = async (config) => ({
    data: body,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  api.axios.defaults.adapter = adapter;
  return api;
};

// What stands in front of a Seerr answers in its place, with a 200: a
// proxy's login page, a URL that points at the web app rather than the API.
// The body then reached Discover as the sliders and crashed its render
// (Sentry REACT-NATIVE-8V).
describe("SeerrApi.discoverSettings", () => {
  test("gives the sliders the server sends", async () => {
    const sliders = [
      { id: 1, type: DiscoverSliderType.TRENDING, order: 0, enabled: true },
    ];
    expect(await answering(JSON.stringify(sliders)).discoverSettings()).toEqual(
      sliders,
    );
  });

  test("has no sliders when a page answers in the server's place", async () => {
    expect(
      await answering(
        "<!DOCTYPE html><html><body>Sign in</body></html>",
      ).discoverSettings(),
    ).toEqual([]);
    // Local only: it is the user's setup, and nothing the app can act on.
    expect(mockWriteToLog).toHaveBeenCalledWith(
      "WARN",
      "Seerr discover settings are not a list",
      expect.stringContaining("<!DOCTYPE html>"),
    );
  });

  test("has no sliders when the answer is an object", async () => {
    expect(
      await answering('{"message":"Not found"}').discoverSettings(),
    ).toEqual([]);
  });

  test("has no sliders when the answer is empty", async () => {
    expect(await answering("").discoverSettings()).toEqual([]);
  });
});

// The genres row's request, answered the same way in Seerr's place. Read as
// genres, a page's characters crash the row: the TypeError of
// REACT-NATIVE-WG.
describe("SeerrApi.getGenreSliders", () => {
  test("gives the genres the server sends", async () => {
    const genres = [{ id: 18, name: "Drama", backdrops: ["/drama.jpg"] }];
    expect(
      await answering(JSON.stringify(genres)).getGenreSliders(Endpoints.MOVIE),
    ).toEqual(genres);
  });

  test("has no genres when a page answers in the server's place", async () => {
    expect(
      await answering(
        "<!DOCTYPE html><html><body>Sign in</body></html>",
      ).getGenreSliders(Endpoints.TV),
    ).toEqual([]);
    expect(mockWriteToLog).toHaveBeenCalledWith(
      "WARN",
      "Seerr genre sliders are not a list",
      expect.stringContaining("<!DOCTYPE html>"),
    );
  });
});

// A Seerr the device cannot reach from where it is.
const unreachable = () => {
  const api = new SeerrApi("https://seerr.example");
  api.axios.defaults.adapter = async () => {
    throw new Error("Network Error");
  };
  return api;
};

describe("SeerrApi.test", () => {
  // The settings screen tests an address the user just typed and says when it
  // fails. A sign-in tests the plugin's address without being asked, and must
  // not toast over the home screen when that Seerr is out of reach.
  test("says when the server cannot be reached", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await unreachable().test()).toEqual({
      isValid: false,
      requiresPass: false,
    });
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  test("stays quiet when the caller asks it to", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await unreachable().test({ quiet: true })).toEqual({
      isValid: false,
      requiresPass: false,
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("SeerrApi.imageProxy", () => {
  // Seerr's own app loads TMDB images through the server's image cache when its admin turned
  // caching on, and from TMDB otherwise, at the size in the URL.
  test("follows the server's image cache", () => {
    const api = new SeerrApi("https://seerr.example");

    expect(api.imageProxy("/abc.jpg", "w342")).toBe(
      "https://image.tmdb.org/t/p/w342/abc.jpg",
    );
    api.cacheImages = true;
    expect(api.imageProxy("/abc.jpg", "w342")).toBe(
      "https://seerr.example/imageproxy/tmdb/t/p/w342/abc.jpg",
    );
  });

  test("goes the same way for an episode still", () => {
    const api = new SeerrApi("https://seerr.example");
    api.cacheImages = true;

    expect(
      api.episodeStill("https://image.tmdb.org/t/p/original//abc.jpg"),
    ).toBe("https://seerr.example/imageproxy/tmdb/t/p/w300/abc.jpg");
  });
});

describe("useSeerrImageCache", () => {
  let queryClient: QueryClient;
  beforeEach(() => {
    // No garbage collection timer, so Jest can exit when the spec ends.
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
    });
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  test("sets the client's image cache from the server's public settings", async () => {
    const api = new SeerrApi("https://seerr.example");
    jest
      .spyOn(api, "publicSettings")
      .mockResolvedValue({ cacheImages: true } as never);

    const { result } = await renderHook(() => useSeerrImageCache(api), {
      wrapper,
    });

    await waitFor(() => expect(result.current?.cacheImages).toBe(true));
    expect(result.current?.imageProxy("/abc.jpg", "w342")).toBe(
      "https://seerr.example/imageproxy/tmdb/t/p/w342/abc.jpg",
    );
    // Another client, for the readers that keep a URL until the client changes.
    expect(result.current).not.toBe(api);
  });

  // Seerr's default, until the server says otherwise.
  test("loads from TMDB while the settings are not in", async () => {
    const api = new SeerrApi("https://seerr.example");
    jest
      .spyOn(api, "publicSettings")
      .mockReturnValue(new Promise(() => {}) as never);

    const { result } = await renderHook(() => useSeerrImageCache(api), {
      wrapper,
    });

    expect(result.current).toBe(api);
    expect(api.cacheImages).toBe(false);
  });

  // A server that serves its images from TMDB: the client stays the same one.
  test("keeps loading from TMDB when the server does not cache images", async () => {
    const api = new SeerrApi("https://seerr.example");
    jest
      .spyOn(api, "publicSettings")
      .mockResolvedValue({ cacheImages: false } as never);

    const { result } = await renderHook(
      () => ({
        client: useSeerrImageCache(api),
        // Read in the same render, so the client below has seen the settings.
        settings: useQuery(seerrPublicSettingsQuery(api)).data,
      }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.settings).toEqual({ cacheImages: false }),
    );
    // One request: both readers share the query the client is built from.
    expect(api.publicSettings).toHaveBeenCalledTimes(1);
    expect(result.current.client).toBe(api);
    expect(api.cacheImages).toBe(false);
  });

  // The server's admin can turn the cache off while the app runs.
  test("goes back to TMDB when the server stops caching images", async () => {
    const api = new SeerrApi("https://seerr.example");
    const publicSettings = jest
      .spyOn(api, "publicSettings")
      .mockResolvedValue({ cacheImages: true } as never);

    const { result } = await renderHook(() => useSeerrImageCache(api), {
      wrapper,
    });
    await waitFor(() => expect(result.current?.cacheImages).toBe(true));

    publicSettings.mockResolvedValue({ cacheImages: false } as never);
    await act(() => queryClient.refetchQueries());

    await waitFor(() => expect(result.current).toBe(api));
    expect(api.cacheImages).toBe(false);
  });
});
