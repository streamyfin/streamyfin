import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { toast } from "sonner-native";
import { MUSIC_PLAY_QUEUE_MAX_ITEMS } from "@/constants/Music";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import type { MusicQueueSource } from "@/utils/music/musicQueries";
import { useMusicPlayQueue } from "./useMusicPlayQueue";

const mockPlayQueue = jest.fn();

jest.mock("@/providers/MusicPlayerProvider", () => ({
  useMusicPlayer: () => ({ playQueue: mockPlayQueue }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
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

const song = (id: string): BaseItemDto => ({ Id: id, Type: "Audio", Name: id });

const playlistFolder: MusicQueueSource = {
  userId: "user-1",
  parentId: "folder-1",
  recursive: true,
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
  const wrapper = ({ children }: PropsWithChildren) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );
  return { api, wrapper };
};

const request = (api: ReturnType<typeof makeApi>) =>
  new URL(api.mock.history.get[0].url ?? "").searchParams;

describe("music Play all and Shuffle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Shuffle on a folder plays a random sample of every song below it", async () => {
    // The server already answers in a random order.
    const picked = [song("c"), song("a"), song("b")];
    const { api, wrapper } = setup(picked);
    const { result } = await renderHook(
      () => useMusicPlayQueue(playlistFolder),
      { wrapper },
    );

    await act(() => result.current.shuffle());

    expect(request(api).getAll("sortBy")).toEqual(["Random"]);
    expect(request(api).get("parentId")).toBe("folder-1");
    expect(request(api).get("recursive")).toBe("true");
    expect(request(api).getAll("includeItemTypes")).toEqual(["Audio"]);
    expect(request(api).get("limit")).toBe(String(MUSIC_PLAY_QUEUE_MAX_ITEMS));
    expect(mockPlayQueue).toHaveBeenCalledTimes(1);
    expect(mockPlayQueue).toHaveBeenCalledWith(picked, 0);
  });

  test("Play all without subfolders plays only the folder's own songs, by name", async () => {
    const { api, wrapper } = setup([song("a"), song("b")]);
    const { result } = await renderHook(
      () => useMusicPlayQueue({ ...playlistFolder, recursive: false }),
      { wrapper },
    );

    await act(() => result.current.playAll());

    expect(request(api).get("recursive")).toBe("false");
    expect(request(api).getAll("sortBy")).toEqual(["SortName"]);
    expect(mockPlayQueue).toHaveBeenCalledWith([song("a"), song("b")], 0);
  });

  // A second request would replace the queue the first one started.
  test("starts one queue when tapped twice before the first answer", async () => {
    const { api, wrapper } = setup([song("a")]);
    const { result } = await renderHook(
      () => useMusicPlayQueue(playlistFolder),
      { wrapper },
    );

    await act(() =>
      Promise.all([result.current.playAll(), result.current.shuffle()]),
    );

    expect(api.mock.history.get).toHaveLength(1);
    expect(mockPlayQueue).toHaveBeenCalledTimes(1);
  });

  test("leaves the queue alone when the answer arrives after the page lost focus", async () => {
    const { wrapper: Providers } = setup([song("a")]);
    const navigation = { isFocused: () => false } as never;
    const { result } = await renderHook(
      () => useMusicPlayQueue(playlistFolder),
      {
        wrapper: ({ children }) => (
          <NavigationContext.Provider value={navigation}>
            <Providers>{children}</Providers>
          </NavigationContext.Provider>
        ),
      },
    );

    await act(() => result.current.shuffle());

    expect(mockPlayQueue).not.toHaveBeenCalled();
  });

  test("asks for nothing before it knows the user and the folder", async () => {
    const { api, wrapper } = setup([song("a")]);
    const { result } = await renderHook(() => useMusicPlayQueue(null), {
      wrapper,
    });

    await act(() => result.current.playAll());

    expect(api.mock.history.get).toHaveLength(0);
  });

  // A folder that only holds folders has no songs of its own.
  test("says so when there is nothing to play", async () => {
    const { wrapper } = setup([]);
    const { result } = await renderHook(
      () => useMusicPlayQueue({ ...playlistFolder, recursive: false }),
      { wrapper },
    );

    await act(() => result.current.playAll());

    expect(mockPlayQueue).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("music.no_songs");
  });

  test("reports a failed request and can be tried again", async () => {
    const { api, wrapper } = setup(null);
    const { result } = await renderHook(
      () => useMusicPlayQueue(playlistFolder),
      { wrapper },
    );

    await act(() => result.current.shuffle());
    expect(toast.error).toHaveBeenCalledWith("common.something_went_wrong");

    api.mock.onGet(/\/Items/).reply(200, { Items: [song("a")] });
    await act(() => result.current.shuffle());
    expect(mockPlayQueue).toHaveBeenCalledTimes(1);
  });
});
