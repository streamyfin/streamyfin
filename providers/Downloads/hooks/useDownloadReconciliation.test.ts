import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook, waitFor } from "@testing-library/react-native";
import { DOCUMENTS, fakeFiles } from "@/test-utils/fileSystem";
import { clearMmkv } from "@/test-utils/mmkv";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
jest.mock("@/modules", () => ({
  BackgroundDownloader: {
    // Native has no task left for it: the video finished while the app was closed.
    getActiveDownloads: async () => [],
    enqueueDownload: jest.fn(),
    cancelQueuedDownload: jest.fn(),
  },
}));
jest.mock("@/utils/customHeaders", () => ({
  getHeadersForUrl: () => undefined,
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

import { getDownloadedItemById } from "../database";
import { getPendingDownload, savePendingDownload } from "../pendingDownloads";
import { useDownloadReconciliation } from "./useDownloadReconciliation";

const item: BaseItemDto = {
  Id: "item-1",
  Name: "Neverland",
  Type: "Episode",
  SeriesName: "Show",
  ParentIndexNumber: 1,
  IndexNumber: 1,
};

beforeEach(() => {
  clearMmkv();
  fakeFiles.clear();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

// The video is handed to native before the extras of its download are in, and the app can close
// in between. Finalizing the download at the next launch would store it without them for good.
it("leaves a video that finished before its extras for the extras to finalize", async () => {
  fakeFiles.sized(`${DOCUMENTS}/show_s01e01.mp4`, 4096);
  savePendingDownload({
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
  });
  const setProcesses = jest.fn();

  await renderHook(() => useDownloadReconciliation({ setProcesses }));

  await waitFor(() => expect(setProcesses).toHaveBeenCalled());
  expect(getDownloadedItemById("item-1")).toBeUndefined();
  expect(getPendingDownload("item-1")).toMatchObject({
    assetsPending: true,
    videoFileSize: 4096,
  });
  expect(setProcesses.mock.calls[0][0]([])).toEqual([
    expect.objectContaining({ id: "item-1", progress: 99 }),
  ]);
});
