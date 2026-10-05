import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useAddToPlaylist } from "./usePlaylistMutations";

// One api for the file: the atom below is read once per Jotai store, so a
// fresh instance per test would leave the hook talking to the first one.
const mockApi = makeApi();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(() => mockApi),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/hooks/useNetworkAwareQueryClient", () => ({
  useNetworkAwareQueryClient: () => ({ invalidateQueries: () => {} }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({
  toast: { success: () => {}, error: () => {} },
}));

const ITEMS_URL = /\/Playlists\/playlist-1\/Items/;

// The request as the server reads it: the query the SDK wrote into the URL
// plus whatever was handed to axios as params.
const sentQuery = () => {
  const [request] = mockApi.mock.history.post;
  const query = new URL(request.url ?? "").searchParams;
  return {
    ids: query.getAll("ids"),
    userId: query.get("userId"),
    ...request.params,
  };
};

const addToPlaylist = async (position?: number) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const { result } = await renderHook(() => useAddToPlaylist(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(() =>
    result.current.mutateAsync({
      playlistId: "playlist-1",
      trackIds: ["track-1", "track-2"],
      position,
    }),
  );
};

describe("useAddToPlaylist", () => {
  beforeEach(() => {
    mockApi.mock.reset();
    mockApi.mock.onPost(ITEMS_URL).reply(204);
  });

  test("appends when no position is asked for", async () => {
    await addToPlaylist();

    expect(sentQuery()).toEqual({
      ids: ["track-1", "track-2"],
      userId: "user-1",
    });
  });

  // 0 is the position that matters most, "add to top", and the one a
  // truthiness check would drop.
  test("sends position 0 to put the tracks at the top", async () => {
    await addToPlaylist(0);

    expect(sentQuery()).toEqual({
      ids: ["track-1", "track-2"],
      userId: "user-1",
      position: 0,
    });
  });

  test("sends the index for a position inside the playlist", async () => {
    await addToPlaylist(3);

    expect(sentQuery()).toMatchObject({ position: 3 });
  });
});
