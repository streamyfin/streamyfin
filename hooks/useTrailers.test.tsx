import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { Linking } from "react-native";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import type { TrailerSource } from "@/utils/atoms/settings";
import type { MovieDetails } from "@/utils/seerr/types";
import { useTrailers } from "./useTrailers";

let mockTrailerSource: TrailerSource = "preferLibrary";
let mockOffline = false;
const mockPlayMedia = jest.fn();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  return {
    apiAtom: atom(mockApi),
    userAtom: atom({ Id: "user-1" }),
    mockApi,
  };
});
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: { trailerSource: mockTrailerSource } }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

const trailerRequests = () =>
  api.mock.history.get.filter((r) => r.url?.includes("/LocalTrailers"));

const movie: BaseItemDto = {
  Id: "movie-1",
  LocalTrailerCount: 1,
  RemoteTrailers: [{ Url: "https://youtu.be/a", Name: "Official trailer" }],
};
const libraryTrailer: BaseItemDto = {
  Id: "trailer-1",
  Name: "Theatrical trailer",
  Type: "Trailer",
};

const renderTrailers = (item: Parameters<typeof useTrailers>[0] = movie) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  return renderHook(() => useTrailers(item), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    ),
  });
};

beforeEach(() => {
  stubReactNative({ OS: "android" });
  mockTrailerSource = "preferLibrary";
  mockOffline = false;
  mockPlayMedia.mockReset();
  api.mock.reset();
  api.mock
    .onGet(/\/Items\/movie-1\/LocalTrailers/)
    .reply(200, [libraryTrailer]);
});

describe("useTrailers", () => {
  test("puts the library trailer the server lists before the remote one", async () => {
    const { result } = await renderTrailers();

    await waitFor(() => expect(result.current.trailers).toHaveLength(2));
    expect(result.current.trailers.map((t) => t.source)).toEqual([
      "library",
      "remote",
    ]);
  });

  // A tap during this window used to fall straight through to the remote
  // trailer, skipping the library one the item promised via LocalTrailerCount.
  test("does not fall back to the remote trailer while the library lookup is in flight", async () => {
    api.mock.reset();
    api.mock
      .onGet(/\/Items\/movie-1\/LocalTrailers/)
      .reply(() => new Promise(() => {}));
    const { result } = await renderTrailers();

    await waitFor(() => expect(trailerRequests()).toHaveLength(1));
    expect(result.current.trailers).toEqual([]);
  });

  // preferRemote asked for the remote trailer regardless of the library
  // one, so a slow library lookup must not hide it.
  test("shows the remote trailer immediately when the source prefers it, even while the library lookup is in flight", async () => {
    mockTrailerSource = "preferRemote";
    api.mock.reset();
    api.mock
      .onGet(/\/Items\/movie-1\/LocalTrailers/)
      .reply(() => new Promise(() => {}));
    const { result } = await renderTrailers();

    await waitFor(() => expect(trailerRequests()).toHaveLength(1));
    expect(result.current.trailers.map((t) => t.source)).toEqual(["remote"]);
  });

  // Most items have no trailer file: the count on the item spares the request.
  test("asks the server for nothing when the item has no library trailer", async () => {
    const { result } = await renderTrailers({ ...movie, LocalTrailerCount: 0 });

    expect(result.current.trailers.map((t) => t.source)).toEqual(["remote"]);
    expect(trailerRequests()).toHaveLength(0);
  });

  test("asks the server for nothing when only remote trailers are wanted", async () => {
    mockTrailerSource = "remoteOnly";
    const { result } = await renderTrailers();

    expect(result.current.trailers.map((t) => t.source)).toEqual(["remote"]);
    expect(trailerRequests()).toHaveLength(0);
  });

  // A downloaded item is offline: neither kind can play without a network.
  test("offers no trailer offline", async () => {
    mockOffline = true;
    const { result } = await renderTrailers();

    expect(result.current.trailers).toEqual([]);
    expect(trailerRequests()).toHaveLength(0);
  });

  test("offers no remote trailer on Apple TV, which has no browser", async () => {
    stubReactNative({ OS: "ios", isTV: true });
    mockTrailerSource = "remoteOnly";
    const { result } = await renderTrailers();

    expect(result.current.trailers).toEqual([]);
  });

  test("takes a Seerr title's trailer videos as remote trailers", async () => {
    const details = {
      id: 1,
      relatedVideos: [
        { type: "Teaser", url: "https://youtu.be/teaser" },
        { type: "Trailer", url: "https://youtu.be/b", name: "Trailer" },
      ],
    } as MovieDetails;
    const { result } = await renderTrailers(details);

    expect(result.current.trailers).toEqual([
      { source: "remote", url: "https://youtu.be/b", name: "Trailer" },
    ]);
  });

  // A trailer starts at the top, not at a resume point it picked up earlier.
  test("plays a library trailer in the app from the start", async () => {
    const { result } = await renderTrailers();
    await waitFor(() => expect(result.current.trailers).toHaveLength(2));

    await act(() => result.current.playTrailer(result.current.trailers[0]));

    expect(mockPlayMedia).toHaveBeenCalledWith(
      { itemId: "trailer-1", offline: false, playbackPositionTicks: 0 },
      { item: libraryTrailer },
    );
  });

  test("opens a remote trailer's link", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    mockTrailerSource = "remoteOnly";
    const { result } = await renderTrailers();

    await act(() => result.current.playTrailer(result.current.trailers[0]));

    expect(openURL).toHaveBeenCalledWith("https://youtu.be/a");
    expect(mockPlayMedia).not.toHaveBeenCalled();
  });
});
