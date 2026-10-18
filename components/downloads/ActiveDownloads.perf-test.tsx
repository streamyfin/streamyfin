import "@/augmentations/number";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { type ReactNode, useState } from "react";
import { measureRenders } from "reassure";
import ActiveDownloads from "@/components/downloads/ActiveDownloads";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { DownloadProvider, processesAtom } from "@/providers/DownloadProvider";
import type { JobStatus } from "@/providers/Downloads/types";
import { makeItems } from "@/test-utils/baseItems";
import { usePerfQueryClient } from "@/test-utils/queryWrapper";

const makeJob = (id: string, progress = 0): JobStatus => ({
  id,
  itemId: id,
  inputUrl: `http://server/download/${id}`,
  item: {
    Id: id,
    Name: `Movie ${id}`,
    Type: "Movie",
    ProductionYear: 2024,
  },
  deviceId: "device-1",
  progress,
  status: "downloading",
  timestamp: new Date("2026-01-01T00:00:00Z"),
  mediaSource: { Id: `source-${id}`, Bitrate: 10_000_000 },
  maxBitrate: { key: "10 Mbps", value: 10_000_000 },
  bytesDownloaded: progress * 100_000,
  estimatedTotalSizeBytes: 10_000_000,
  speed: 1_000_000,
});

const activeJobs = [
  makeJob("1", 0),
  makeJob("2", 0),
  makeJob("3", 0),
  makeJob("4", 0),
  makeJob("5", 0),
];

let activeStore: ReturnType<typeof createStore>;

const createWrapper = (initialJobs: JobStatus[]) => {
  return function TestWrapper({ children }: { children: ReactNode }) {
    const [store] = useState(() => {
      const s = createStore();
      s.set(processesAtom, initialJobs);
      activeStore = s;
      return s;
    });
    const queryClient = usePerfQueryClient();

    return (
      <JotaiProvider store={store}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </JotaiProvider>
    );
  };
};

describe("DownloadProvider Performance", () => {
  test("download progress updates re-render the active downloads list", async () => {
    const Wrapper = createWrapper(activeJobs);
    await measureRenders(
      <DownloadProvider>
        <ActiveDownloads />
      </DownloadProvider>,
      {
        wrapper: Wrapper,
        scenario: async () => {
          await screen.findByText("Movie 1");
          for (let i = 1; i <= 30; i++) {
            await act(async () => {
              activeStore.set(
                processesAtom,
                activeJobs.map((job) => ({
                  ...job,
                  progress: i,
                  bytesDownloaded: i * 100_000,
                })),
              );
            });
          }
        },
      },
    );
  });

  test("download progress updates re-render an unrelated useDownload consumer", async () => {
    const unrelatedJob = [makeJob("unrelated", 0)];
    const Wrapper = createWrapper(unrelatedJob);
    const downloadedItem = makeItems(1, "Downloaded")[0];

    await measureRenders(
      <DownloadProvider>
        <DownloadSize items={[downloadedItem]} />
      </DownloadProvider>,
      {
        wrapper: Wrapper,
        scenario: async () => {
          await screen.findByText("0 Bytes");
          for (let i = 1; i <= 30; i++) {
            await act(async () => {
              activeStore.set(processesAtom, [
                {
                  ...unrelatedJob[0],
                  progress: i,
                  bytesDownloaded: i * 100_000,
                },
              ]);
            });
          }
        },
      },
    );
  });
});
