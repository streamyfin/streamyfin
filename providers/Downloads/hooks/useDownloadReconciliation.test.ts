import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook, waitFor } from "@testing-library/react-native";
import { DOCUMENTS } from "@/test-utils/fileSystem";
import type { PendingDownload } from "../pendingDownloads";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
// Native has no task left for it: the video finished while the app was closed.
const mockGetActiveDownloads = jest.fn(async () => []);
jest.mock("@/modules", () => ({
  BackgroundDownloader: {
    getActiveDownloads: () => mockGetActiveDownloads(),
    enqueueDownload: jest.fn(),
    cancelQueuedDownload: jest.fn(),
  },
}));
jest.mock("@/utils/customHeaders", () => ({
  getHeadersForUrl: () => undefined,
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

const sharedReact = jest.requireActual("react");

/**
 * The hook reconciles once per JS runtime, as the app needs: each case loads its own, over its
 * own storage and files.
 */
const freshRuntime = () => {
  let runtime!: {
    fakeFiles: typeof import("@/test-utils/fileSystem").fakeFiles;
    pending: typeof import("../pendingDownloads");
    database: typeof import("../database");
    useDownloadReconciliation: typeof import("./useDownloadReconciliation").useDownloadReconciliation;
  };
  jest.isolateModules(() => {
    // One React, the one the renderer runs: a second copy has no dispatcher for the hook.
    jest.doMock("react", () => sharedReact);
    runtime = {
      fakeFiles: (
        require("@/test-utils/fileSystem") as typeof import("@/test-utils/fileSystem")
      ).fakeFiles,
      pending: require("../pendingDownloads"),
      database: require("../database"),
      useDownloadReconciliation: (
        require("./useDownloadReconciliation") as typeof import("./useDownloadReconciliation")
      ).useDownloadReconciliation,
    };
  });
  return runtime;
};

const item: BaseItemDto = {
  Id: "item-1",
  Name: "Neverland",
  Type: "Episode",
  SeriesName: "Show",
  ParentIndexNumber: 1,
  IndexNumber: 1,
};

const waitingForExtras: PendingDownload = {
  itemId: "item-1",
  status: "downloading",
  taskId: 3,
  enqueuedAt: "2026-11-01T10:00:00.000Z",
  inputUrl: "https://jellyfin.example/Items/item-1/Download",
  videoFileName: "show_s01e01.mp4",
  item,
  mediaSource: {},
  maxBitrate: { key: "Max", value: undefined },
  deviceId: "device",
  assetsPending: true,
};

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});

// The video is handed to native before the extras of its download are in, and the app can close
// in between. Finalizing the download at the next launch would store it without them for good.
it("leaves a video that finished before its extras for the extras to finalize", async () => {
  const { fakeFiles, pending, database, useDownloadReconciliation } =
    freshRuntime();
  fakeFiles.sized(`${DOCUMENTS}/show_s01e01.mp4`, 4096);
  pending.savePendingDownload(waitingForExtras);
  const setProcesses = jest.fn();

  await renderHook(() => useDownloadReconciliation({ setProcesses }));

  await waitFor(() => expect(setProcesses).toHaveBeenCalled());
  expect(database.getDownloadedItemById("item-1")).toBeUndefined();
  expect(pending.getPendingDownload("item-1")).toMatchObject({
    assetsPending: true,
    videoFileSize: 4096,
  });
  expect(setProcesses.mock.calls[0][0]([])).toEqual([
    expect.objectContaining({ id: "item-1", progress: 99 }),
  ]);
});

// The extras are fetched again on launch, alongside this, and can be stored while it waits on
// native. The record read before that wait does not have them: finalizing it lost them for good.
it("finalizes with the extras stored while it waited on native", async () => {
  const { fakeFiles, pending, database, useDownloadReconciliation } =
    freshRuntime();
  fakeFiles.sized(`${DOCUMENTS}/show_s01e01.mp4`, 4096);
  pending.savePendingDownload(waitingForExtras);
  mockGetActiveDownloads.mockImplementationOnce(async () => {
    pending.storeDownloadAssets("item-1", {
      updatedMediaSource: { Id: "source-with-sidecars" },
      trickPlayData: { path: "trickplay/", size: 1 },
    });
    return [];
  });

  await renderHook(() =>
    useDownloadReconciliation({ setProcesses: jest.fn() }),
  );

  await waitFor(() =>
    expect(database.getDownloadedItemById("item-1")).toBeDefined(),
  );
  expect(database.getDownloadedItemById("item-1")).toMatchObject({
    mediaSource: { Id: "source-with-sidecars" },
    trickPlayData: { path: "trickplay/", size: 1 },
  });
  expect(pending.getPendingDownload("item-1")).toBeUndefined();
});
