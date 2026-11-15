import { QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { type ReactNode, useState } from "react";
import { Text } from "react-native";
import { measureRenders } from "reassure";
import { DownloadProvider, useDownload } from "@/providers/DownloadProvider";
import type {
  DownloadedItem,
  DownloadsDatabase,
} from "@/providers/Downloads/types";
import { makeItems } from "@/test-utils/baseItems";
import { usePerfQueryClient } from "@/test-utils/queryWrapper";

// The database keeps the parsed index in module state, so every run after
// the first would skip the parse that a launch pays for. Each run loads a
// fresh copy of the module, over a fresh MMKV holding the stored index, and
// every importer reaches that copy through this forwarder.
let mockDatabase: Record<string, unknown> = {};
jest.mock(
  "@/providers/Downloads/database",
  () => new Proxy({}, { get: (_, name: string) => mockDatabase[name] }),
);

const SERIES = 20;
const SEASONS = 3;
const EPISODES_PER_SEASON = 10;

const download = (item: DownloadedItem["item"]): DownloadedItem => ({
  item,
  mediaSource: { Id: `source-${item.Id}`, MediaStreams: [] },
  videoFilePath: `file:///documents/${item.Id}.mp4`,
  videoFileSize: 1_000_000_000,
  userData: {
    subtitleStreamIndex: -1,
    audioStreamIndex: 0,
    isTranscoded: false,
  },
});

/** 20 series of 3 seasons of 10 episodes, and 100 movies: 700 downloads. */
const storedIndex = (): string => {
  const db: DownloadsDatabase = { movies: {}, series: {}, other: {} };
  for (const movie of makeItems(100, "Movie")) {
    db.movies[movie.Id!] = download({
      ...movie,
      Overview: `The overview of ${movie.Name}.`,
    });
  }
  for (let series = 0; series < SERIES; series++) {
    const seriesId = `series-${series}`;
    db.series[seriesId] = {
      seriesInfo: { Id: seriesId, Name: `Show ${series}`, Type: "Series" },
      seasons: {},
    };
    for (let season = 1; season <= SEASONS; season++) {
      const episodes: Record<number, DownloadedItem> = {};
      makeItems(
        EPISODES_PER_SEASON,
        `${seriesId}-S${season}`,
        "Episode",
      ).forEach((episode, index) => {
        episodes[index + 1] = download({
          ...episode,
          SeriesId: seriesId,
          ParentIndexNumber: season,
          IndexNumber: index + 1,
          Overview: `The overview of ${episode.Name}.`,
        });
      });
      db.series[seriesId].seasons[season] = { episodes };
    }
  }
  return JSON.stringify(db);
};

const STORED_INDEX = storedIndex();
const DOWNLOADS = 100 + SERIES * SEASONS * EPISODES_PER_SEASON;

const loadColdDatabase = () => {
  jest.isolateModules(() => {
    const { storage } = jest.requireActual("@/utils/mmkv");
    storage.set("downloads.v2.json", STORED_INDEX);
    mockDatabase = jest.requireActual("@/providers/Downloads/database");
  });
};

const DownloadCount = () => {
  const { downloadedItems } = useDownload();
  return <Text>{`${downloadedItems.length} downloads`}</Text>;
};

const Wrapper = ({ children }: { children: ReactNode }) => {
  const [store] = useState(() => createStore());
  const queryClient = usePerfQueryClient();
  return (
    <JotaiProvider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </JotaiProvider>
  );
};

describe("DownloadProvider Performance", () => {
  // The provider read and parsed the whole download index inside its first
  // render, on every launch, whether or not a download was ever shown.
  test("the app launches with a large download index", async () => {
    await measureRenders(
      <DownloadProvider>
        <DownloadCount />
      </DownloadProvider>,
      {
        wrapper: Wrapper,
        beforeEach: loadColdDatabase,
        scenario: async () => {
          await screen.findByText(`${DOWNLOADS} downloads`);
        },
      },
    );
  });
});
