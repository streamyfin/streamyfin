import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import type { DownloadCompleteEvent } from "@/modules";
import { DOCUMENTS, fakeFiles } from "@/test-utils/fileSystem";
import { clearMmkv } from "@/test-utils/mmkv";

// The pending records and the downloads database are real, over the MMKV double: together they
// are what says whether a completed file belongs to anything.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
const mockListeners: {
  complete?: (event: DownloadCompleteEvent) => Promise<void>;
} = {};
jest.mock("@/modules", () => ({
  BackgroundDownloader: {
    addStartedListener: () => ({ remove: () => {} }),
    addProgressListener: () => ({ remove: () => {} }),
    addErrorListener: () => ({ remove: () => {} }),
    addCompleteListener: (listener: typeof mockListeners.complete) => {
      mockListeners.complete = listener;
      return { remove: () => {} };
    },
  },
}));
jest.mock("../notifications", () => ({
  getNotificationContent: () => ({ title: "", body: "" }),
  sendDownloadNotification: jest.fn(),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeToLog: jest.fn(),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { clearAllDownloadedItems, getDownloadedItemById } from "../database";
import {
  finalizePendingDownload,
  type PendingDownload,
} from "../pendingDownloads";
import { useDownloadEventHandlers } from "./useDownloadEventHandlers";

const VIDEO = `${DOCUMENTS}/show_s01e01.mp4`;

const item: BaseItemDto = {
  Id: "item-1",
  Name: "Neverland",
  Type: "Episode",
  SeriesName: "Show",
  ParentIndexNumber: 1,
  IndexNumber: 1,
};
const record: PendingDownload = {
  itemId: "item-1",
  status: "downloading",
  enqueuedAt: "2026-10-04T12:00:00.000Z",
  taskId: 7,
  inputUrl: "https://jellyfin.example/Items/item-1/Download",
  videoFileName: "show_s01e01.mp4",
  item,
  mediaSource: {},
  maxBitrate: { key: "Max", value: undefined },
  deviceId: "device",
};
const completed: DownloadCompleteEvent = {
  taskId: 7,
  // Native reports a plain path, not a file:// uri.
  filePath: "/documents/show_s01e01.mp4",
  url: record.inputUrl,
  itemId: "item-1",
};

const complete = async (event: DownloadCompleteEvent) => {
  await renderHook(() =>
    useDownloadEventHandlers({
      processes: [],
      updateProcess: jest.fn(),
      removeProcess: jest.fn(),
    }),
  );
  await mockListeners.complete?.(event);
};

beforeEach(() => {
  clearMmkv();
  // The database caches what it parsed, so emptying the store alone would not reset it.
  clearAllDownloadedItems();
  fakeFiles.clear();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("a completed download with no pending record", () => {
  // The native cancel is asynchronous on iOS, so a transfer that finishes while it is on its way
  // is still moved into Documents and reported complete. The cancel has dropped the record and
  // cleaned up by then, which left the whole video on disk with nothing pointing at it.
  it("removes the video of a download that finished while it was being cancelled", async () => {
    fakeFiles.add(VIDEO);

    await complete(completed);

    expect(fakeFiles.remaining()).toEqual([]);
    expect(getDownloadedItemById("item-1")).toBeUndefined();
  });

  // useDownloadReconciliation finalizes a download it finds complete on disk, and the completion
  // event for it can still arrive afterwards. That file is a finished download, not a leftover.
  it("keeps a download that was finalized before its event arrived", async () => {
    fakeFiles.add(VIDEO);
    finalizePendingDownload(record, 1024);

    await complete(completed);

    expect(fakeFiles.deleted()).toEqual([]);
    expect(getDownloadedItemById("item-1")).toBeDefined();
  });

  // Music downloads go through the same native module without an item id, and AudioStorage
  // tracks them itself.
  it("leaves a download that is not a video download alone", async () => {
    fakeFiles.add(VIDEO);

    await complete({ ...completed, itemId: undefined });

    expect(fakeFiles.deleted()).toEqual([]);
  });
});
