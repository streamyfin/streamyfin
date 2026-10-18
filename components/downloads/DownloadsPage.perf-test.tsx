import "@/augmentations/number";
import { act, screen } from "@testing-library/react-native";
import { atom, getDefaultStore } from "jotai";
import { measureRenders } from "reassure";
import DownloadsPage from "@/app/(auth)/(tabs)/(home)/downloads/index";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { makeItems } from "@/test-utils/baseItems";

// The downloads live in native storage; the page reads them from the hook.
const mockDownloaded = atom<DownloadedItem[]>([]);
jest.mock("@/providers/DownloadProvider", () => {
  const { useAtomValue } = jest.requireActual("jotai");
  return {
    useDownload: () => ({
      downloadedItems: useAtomValue(mockDownloaded),
      processes: [],
      deleteFile: async () => {},
      deleteItems: async () => {},
      deleteFileByType: async () => {},
      deleteAllFiles: async () => {},
      getDownloadedItemSize: () => 0,
    }),
  };
});

const store = getDefaultStore();

const download = (item: DownloadedItem["item"]): DownloadedItem => ({
  item,
  mediaSource: { Id: `source-${item.Id}` },
  videoFilePath: `/downloads/${item.Id}.mp4`,
  videoFileSize: 1_000_000,
  userData: {
    subtitleStreamIndex: -1,
    audioStreamIndex: 0,
    isTranscoded: false,
  },
});

const SERIES = 5;
const EPISODES_PER_SERIES = 6;
const movies = makeItems(30, "Movie").map(download);
const episodes = Array.from({ length: SERIES }, (_, series) =>
  makeItems(EPISODES_PER_SERIES, `Show${series}`, "Episode").map((episode) =>
    download({
      ...episode,
      SeriesName: `Show ${series}`,
      SeriesId: `series-${series}`,
    }),
  ),
).flat();

describe("Downloads Performance", () => {
  beforeEach(() => {
    store.set(mockDownloaded, [...movies, ...episodes]);
  });

  test("the downloads page renders its library, then one download is deleted", async () => {
    await measureRenders(<DownloadsPage />, {
      scenario: async () => {
        await screen.findAllByText("Movie 0");
        for (let remaining = movies.length - 1; remaining > 20; remaining--) {
          await act(async () => {
            store.set(mockDownloaded, [
              ...movies.slice(0, remaining),
              ...episodes,
            ]);
          });
        }
      },
    });
  });
});
