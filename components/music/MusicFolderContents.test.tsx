import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { MusicFolderContents } from "./MusicFolderContents";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
jest.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useMusicPlayQueue", () => ({
  useMusicPlayQueue: () => ({
    playAll: jest.fn(),
    shuffle: jest.fn(),
    isStarting: false,
  }),
}));
jest.mock("@/hooks/useIncludeSubfolders", () => ({
  useIncludeSubfolders: () => ({ value: true, setValue: jest.fn() }),
}));
jest.mock("@/components/Loader", () => ({ Loader: () => null }));
// The states under test render no list, and these pull in modules Jest does
// not transform (the list itself, and the router behind a row's press).
jest.mock("@shopify/flash-list", () => ({ FlashList: () => null }));
jest.mock("@/components/music/MusicFolderRow", () => ({
  MusicFolderRow: () => null,
}));
jest.mock("@/components/music/MusicTrackItem", () => ({
  MusicTrackItem: () => null,
}));
jest.mock("@/components/music/MusicPlayAllHeader", () => ({
  MusicPlayAllHeader: () => null,
}));
jest.mock("@/components/music/TrackOptionsSheets", () => ({
  TrackOptionsSheets: () => null,
}));

const SUBFOLDERS = /filters=IsFolder/;
const SONGS = /includeItemTypes=Audio/;

const setup = () => {
  const api = makeApi();
  const store = createStore();
  store.set(apiAtom, api);
  store.set(userAtom, { Id: "user-1" });
  const queryClient = new QueryClient({
    // No garbage collection timer to keep Jest running after the last test.
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const show = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MusicFolderContents folderId='folder-1' />
        </JotaiProvider>
      </QueryClientProvider>,
    );
  return { api, show };
};

// A folder whose contents failed to load used to read "This folder is empty",
// with no way to try again.
describe("a music folder that failed to load", () => {
  it.each([
    ["its songs", SONGS, SUBFOLDERS],
    ["its subfolders", SUBFOLDERS, SONGS],
  ])("offers a retry when %s fail", async (_label, failing, working) => {
    const { api, show } = setup();
    api.mock.onGet(failing).replyOnce(500);
    api.mock.onGet(working).reply(200, { Items: [] });
    await show();

    expect(await screen.findByText("common.something_went_wrong")).toBeTruthy();
    expect(screen.queryByText("music.folder_empty")).toBeNull();

    api.mock.onGet(failing).reply(200, { Items: [] });
    fireEvent.press(screen.getByText("home.retry"));

    expect(await screen.findByText("music.folder_empty")).toBeTruthy();
  });

  it("shows an empty folder as empty", async () => {
    const { api, show } = setup();
    api.mock.onGet(/\/Items/).reply(200, { Items: [] });
    await show();

    await waitFor(() =>
      expect(screen.getByText("music.folder_empty")).toBeTruthy(),
    );
    expect(screen.queryByText("common.something_went_wrong")).toBeNull();
  });
});
