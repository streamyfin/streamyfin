import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { toast } from "sonner-native";
import { PLAY_QUEUE_MAX_ITEMS } from "@/constants/Playback";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import type { LibraryItemsFilter } from "@/utils/library/libraryItemsQuery";
import { useLibraryPlayQueue } from "./useLibraryPlayQueue";
import { usePlaybackManager } from "./usePlaybackManager";
import { useShuffleQueue } from "./useShuffleQueue";

const mockPlayMedia = jest.fn();

// BitrateSelector is a React component module; only the BITRATES table matters.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// A new function on every render, as the real hook hands out.
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia:
    () =>
    (...args: unknown[]) =>
      mockPlayMedia(...args),
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: true }),
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItemById: () => undefined,
    getDownloadedItems: () => [],
    updateDownloadedItem: () => {},
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
// The log module reaches Sentry, whose client keeps a timer running past the
// last test.
jest.mock("@/utils/log", () => ({ writeErrorLog: () => undefined }));
jest.mock("react-i18next", () => {
  // One `t` for every render, as react-i18next keeps it.
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
jest.mock("sonner-native", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn() }),
}));

const movie = (id: string, extra: BaseItemDto = {}): BaseItemDto => ({
  Id: id,
  Type: "Movie",
  Name: id,
  ...extra,
});

const horrorMovies: LibraryItemsFilter = {
  userId: "user-1",
  libraryId: "library-1",
  collectionType: "movies",
  sortBy: "SortName",
  sortOrder: "Ascending",
  filterBy: [],
  genres: ["Horror"],
  years: [],
  tags: [],
};

const setup = (items: BaseItemDto[] | null) => {
  const api = makeApi();
  if (items) {
    api.mock.onGet(/\/Items/).reply(200, { Items: items });
  } else {
    api.mock.onGet(/\/Items/).reply(500);
  }
  const store = createStore();
  store.set(apiAtom, api);
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
  return { api, store, wrapper };
};

const start = async (
  wrapper: ReturnType<typeof setup>["wrapper"],
  action: "playAll" | "shuffle",
) => {
  const { result } = await renderHook(() => useLibraryPlayQueue(horrorMovies), {
    wrapper,
  });
  await act(() => result.current[action]());
};

const neighbours = async (
  wrapper: ReturnType<typeof setup>["wrapper"],
  item: BaseItemDto,
) => {
  const { result } = await renderHook(() => usePlaybackManager({ item }), {
    wrapper,
  });
  return {
    previous: result.current.previousItem?.Id,
    next: result.current.nextItem?.Id,
  };
};

describe("library Play All and Shuffle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Shuffle on a filtered movie library plays a random filtered movie and continues the queue", async () => {
    // The server already answers in a random order.
    const picked = [movie("c"), movie("a"), movie("b")];
    const { api, wrapper } = setup(picked);

    await start(wrapper, "shuffle");

    const request = new URL(api.mock.history.get[0].url ?? "").searchParams;
    expect(request.getAll("sortBy")).toEqual(["Random"]);
    expect(request.getAll("genres")).toEqual(["Horror"]);
    expect(request.getAll("includeItemTypes")).toEqual(["Movie"]);
    expect(request.get("parentId")).toBe("library-1");
    expect(request.get("limit")).toBe(String(PLAY_QUEUE_MAX_ITEMS));

    expect(mockPlayMedia).toHaveBeenCalledTimes(1);
    expect(mockPlayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "c", offline: false }),
      { preserveShuffleQueue: true, item: picked[0] },
    );

    // A movie belongs to no series: the queue is what names its neighbours.
    expect(await neighbours(wrapper, picked[0])).toEqual({ next: "a" });
    expect(await neighbours(wrapper, picked[1])).toEqual({
      previous: "c",
      next: "b",
    });
    expect(await neighbours(wrapper, picked[2])).toEqual({ previous: "a" });
    // An item opened some other way does not inherit them.
    expect(await neighbours(wrapper, movie("elsewhere"))).toEqual({});
  });

  test("Play All keeps the library's order and skips an item with no media file", async () => {
    const { api, store, wrapper } = setup([
      movie("missing", { LocationType: "Virtual" }),
      movie("a"),
      movie("b"),
    ]);

    await start(wrapper, "playAll");

    const request = new URL(api.mock.history.get[0].url ?? "").searchParams;
    expect(request.getAll("sortBy")[0]).toBe("SortName");
    expect(request.getAll("sortOrder")).toEqual(["Ascending"]);
    expect(mockPlayMedia.mock.calls[0][0].itemId).toBe("a");
    expect(store.get(shuffleQueueAtom)?.items.map((i) => i.Id)).toEqual([
      "a",
      "b",
    ]);
  });

  // The buttons live in header options set from an effect: callbacks that
  // changed on every render rebuilt the header on every render.
  test("hands out the same callbacks for as long as the filters stay the same", async () => {
    const { wrapper } = setup([]);
    const { result, rerender } = await renderHook(
      () => useLibraryPlayQueue(horrorMovies),
      { wrapper },
    );
    const { playAll, shuffle } = result.current;

    await rerender(undefined);

    expect(result.current.playAll).toBe(playAll);
    expect(result.current.shuffle).toBe(shuffle);
  });

  test("shuffling a series plays every episode that has a file, once", async () => {
    const { store, wrapper } = setup([]);
    const episodes: BaseItemDto[] = [
      { Id: "e1", Type: "Episode" },
      { Id: "e2", Type: "Episode" },
      { Id: "e3", Type: "Episode", LocationType: "Virtual" },
    ];
    const { result } = await renderHook(() => useShuffleQueue(), { wrapper });

    await act(async () => {
      result.current.startShuffle(episodes, { isOffline: true });
    });

    const queued = store.get(shuffleQueueAtom)?.items.map((i) => i.Id) ?? [];
    expect([...queued].sort()).toEqual(["e1", "e2"]);
    expect(mockPlayMedia.mock.calls[0][0]).toMatchObject({
      itemId: queued[0],
      offline: true,
    });
  });

  // With the native player nothing else stops it: the movie would present
  // over whatever screen the user moved on to.
  test("starts nothing when the answer arrives after the page lost focus", async () => {
    const { store, wrapper: Providers } = setup([movie("a")]);
    const navigation = { isFocused: () => false } as never;

    await start(
      ({ children }) => (
        <NavigationContext.Provider value={navigation}>
          <Providers>{children}</Providers>
        </NavigationContext.Provider>
      ),
      "shuffle",
    );

    expect(mockPlayMedia).not.toHaveBeenCalled();
    expect(store.get(shuffleQueueAtom)).toBeNull();
  });

  test("says so instead of opening a player when nothing can be played", async () => {
    const { store, wrapper } = setup([]);

    await start(wrapper, "shuffle");

    expect(mockPlayMedia).not.toHaveBeenCalled();
    expect(store.get(shuffleQueueAtom)).toBeNull();
    expect(toast).toHaveBeenCalledWith("library.no_results");
  });

  test("reports a failed request and can be tried again", async () => {
    const { api, wrapper } = setup(null);
    const { result } = await renderHook(
      () => useLibraryPlayQueue(horrorMovies),
      { wrapper },
    );

    await act(() => result.current.shuffle());
    expect(toast.error).toHaveBeenCalledWith("common.something_went_wrong");
    expect(mockPlayMedia).not.toHaveBeenCalled();

    api.mock.onGet(/\/Items/).reply(200, { Items: [movie("a")] });
    await act(() => result.current.shuffle());
    expect(mockPlayMedia).toHaveBeenCalledTimes(1);
  });
});
