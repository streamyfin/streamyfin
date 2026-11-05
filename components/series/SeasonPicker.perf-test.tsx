import { act, screen } from "@testing-library/react-native";
import { atom, createStore, Provider as JotaiProvider } from "jotai";
import { type ReactNode, useState } from "react";
import { measureRenders } from "reassure";
import {
  SeasonPicker,
  seasonIndexAtom,
} from "@/components/series/SeasonPicker";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";

// The downloads live in native storage; the picker reads them from the hook.
const mockDownloaded = atom<DownloadedItem[]>([]);
jest.mock("@/providers/DownloadProvider", () => {
  const { useAtomValue } = jest.requireActual("jotai");
  return {
    useDownload: () => {
      const downloadedItems = useAtomValue(mockDownloaded);
      return {
        downloadedItems,
        getDownloadedItems: () => downloadedItems,
        processes: [],
        startBackgroundDownload: async () => {},
      };
    },
  };
});
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => false,
}));
jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);
jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock(
  "react-native-gesture-handler",
  () => jest.requireActual("@/test-utils/gestureHandler").gestureHandlerModule,
);
// It loads the native mpv module to ask whether SyncPlay is available.
jest.mock("@/components/syncplay/SyncPlayQueueButton", () => ({
  SyncPlayQueueButton: () => null,
}));

const SERIES = { Id: "series-1", Type: "Series" as const, Name: "Show" };
const EPISODES = makeItems(12, "Episode", "Episode").map((episode, index) => ({
  ...episode,
  SeriesId: SERIES.Id,
  SeasonId: "season-1",
  ParentIndexNumber: 1,
  IndexNumber: index + 1,
}));

const api = createStore().get(apiAtom) as ReturnType<typeof makeApi>;
api.mock.reset();
api.mock.onGet(/\/Shows\/series-1\/Seasons/).reply(200, {
  Items: [{ Id: "season-1", IndexNumber: 1, Name: "Season 1" }],
});
api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(200, {
  Items: EPISODES,
  TotalRecordCount: EPISODES.length,
});
api.mock.onGet(/\/Items\//).reply(200, {});

const downloaded = (episode: (typeof EPISODES)[number]): DownloadedItem => ({
  item: episode,
  mediaSource: { Id: `source-${episode.Id}` },
  videoFilePath: `/downloads/${episode.Id}.mp4`,
  videoFileSize: 19_358,
  userData: {
    subtitleStreamIndex: -1,
    audioStreamIndex: 0,
    isTranscoded: false,
  },
});

let activeStore: ReturnType<typeof createStore>;

const Wrapper = ({ children }: { children: ReactNode }) => {
  const [store] = useState(() => {
    const s = createStore();
    s.set(seasonIndexAtom, { [SERIES.Id]: 1 });
    s.set(mockDownloaded, []);
    activeStore = s;
    return s;
  });
  return (
    <JotaiProvider store={store}>
      <QueryWrapper>{children}</QueryWrapper>
    </JotaiProvider>
  );
};

describe("SeasonPicker Performance", () => {
  // A series download finishes its episodes one after another. Online, each
  // one used to change the queries' keys: the list went blank and was fetched
  // again, so the page flashed once per episode.
  test("a season's episodes finish downloading one by one, online", async () => {
    await measureRenders(<SeasonPicker item={SERIES} />, {
      wrapper: Wrapper,
      scenario: async () => {
        await screen.findAllByText("Episode 0");
        for (let done = 1; done <= EPISODES.length; done++) {
          await act(async () => {
            activeStore.set(
              mockDownloaded,
              EPISODES.slice(0, done).map(downloaded),
            );
          });
          // On a phone the next episode lands seconds later, after any refetch.
          await screen.findAllByText("Episode 0");
        }
      },
    });
  });
});
