import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import type { DownloadCompleteEvent, DownloadStartedEvent } from "@/modules";
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
  started?: (event: DownloadStartedEvent) => void;
  complete?: (event: DownloadCompleteEvent) => Promise<void>;
} = {};
const mockCancelDownload = jest.fn();
jest.mock("@/modules", () => ({
  BackgroundDownloader: {
    cancelDownload: (taskId: number) => mockCancelDownload(taskId),
    addStartedListener: (listener: typeof mockListeners.started) => {
      mockListeners.started = listener;
      return { remove: () => {} };
    },
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
  getPendingDownload,
  type PendingDownload,
  savePendingDownload,
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

const started: DownloadStartedEvent = {
  taskId: 7,
  url: record.inputUrl,
  itemId: "item-1",
};

/**
 * Mounts the hook and hands back the listener it registered. A hook that registers none fails
 * the test: every "nothing was deleted" assertion below would otherwise pass on its own.
 */
const listenerFor = async <K extends keyof typeof mockListeners>(name: K) => {
  await renderHook(() =>
    useDownloadEventHandlers({
      processes: [],
      updateProcess: jest.fn(),
      removeProcess: jest.fn(),
    }),
  );
  const listener = mockListeners[name];
  if (!listener) throw new Error(`the hook registered no ${name} listener`);
  return listener as NonNullable<(typeof mockListeners)[K]>;
};

const complete = async (event: DownloadCompleteEvent) =>
  (await listenerFor("complete"))(event);

const start = async (event: DownloadStartedEvent) =>
  (await listenerFor("started"))(event);

beforeEach(() => {
  mockListeners.started = undefined;
  mockListeners.complete = undefined;
  mockCancelDownload.mockClear();
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

// The item was cancelled and started again, and the first transfer still finished: its event
// carries the item id the new record is filed under. Taken for the new download's completion,
// it finalized that download with the old file while its own transfer was still running.
describe("a completed download whose record waits on another task", () => {
  it("does not finalize the record of the new transfer", async () => {
    fakeFiles.add(VIDEO);
    savePendingDownload({ ...record, taskId: 8 });

    await complete(completed);

    expect(getPendingDownload("item-1")).toMatchObject({ taskId: 8 });
    expect(getDownloadedItemById("item-1")).toBeUndefined();
    // The new transfer replaces the file when it finishes.
    expect(fakeFiles.deleted()).toEqual([]);
  });

  // A record that was never told its task id (the started event went to a dead runtime) is
  // completed by whichever transfer reports for the item.
  it("finalizes a record that has no task id yet", async () => {
    fakeFiles.add(VIDEO);
    savePendingDownload({ ...record, status: "queued", taskId: undefined });
    // The handler takes the card down on a timer, which would outlive the test.
    jest.useFakeTimers();

    await complete(completed);
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    expect(getPendingDownload("item-1")).toBeUndefined();
    expect(getDownloadedItemById("item-1")).toBeDefined();
  });
});

describe("a download that starts", () => {
  // A cancel of a queued download only has the queue to try. When native had just taken the
  // download out of it, the cancel found nothing, the record went, and the transfer ran to the
  // end with no card.
  it("is cancelled when its record is already gone", async () => {
    await start(started);

    expect(mockCancelDownload).toHaveBeenCalledWith(7);
  });

  it("gets its task id when its record is there", async () => {
    savePendingDownload({ ...record, status: "queued", taskId: undefined });

    await start(started);

    expect(mockCancelDownload).not.toHaveBeenCalled();
    expect(getPendingDownload("item-1")).toMatchObject({
      status: "downloading",
      taskId: 7,
    });
  });

  // Music downloads go through the same native module without an item id.
  it("is left alone when it is not a video download", async () => {
    await start({ ...started, itemId: undefined });

    expect(mockCancelDownload).not.toHaveBeenCalled();
  });
});
