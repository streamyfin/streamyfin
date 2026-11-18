import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { PendingDownload } from "../pendingDownloads";

const mockDownloader = {
  getActiveDownloads: jest.fn(),
  enqueueDownload: jest.fn(),
  cancelQueuedDownload: jest.fn(),
  restorePausedDownload: jest.fn(),
};
jest.mock("@/modules", () => ({
  get BackgroundDownloader() {
    return mockDownloader;
  },
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

/**
 * Reconciliation runs once per JS runtime, so each spec loads it, and the stores it reads, in a
 * registry of its own. The fakes come from that registry too: they keep their state per module
 * instance.
 */
const load = () => {
  let loaded!: {
    useDownloadReconciliation: typeof import("./useDownloadReconciliation").useDownloadReconciliation;
    pending: typeof import("../pendingDownloads");
    database: typeof import("../database");
    fakeFiles: typeof import("@/test-utils/fileSystem").fakeFiles;
    DOCUMENTS: string;
  };
  // The renderer is outside the registry, so the hook must use its React.
  const react = jest.requireActual("react");
  const reactNative = jest.requireActual("react-native");
  jest.isolateModules(() => {
    jest.doMock("react", () => react);
    jest.doMock("react-native", () => reactNative);
    const fileSystem = require("@/test-utils/fileSystem");
    require("@/test-utils/mmkv").clearMmkv();
    fileSystem.fakeFiles.clear();
    loaded = {
      useDownloadReconciliation: require("./useDownloadReconciliation")
        .useDownloadReconciliation,
      pending: require("../pendingDownloads"),
      database: require("../database"),
      fakeFiles: fileSystem.fakeFiles,
      DOCUMENTS: fileSystem.DOCUMENTS,
    };
  });
  return loaded;
};

const record = (
  itemId: string,
  status: PendingDownload["status"],
): PendingDownload => ({
  itemId,
  status,
  enqueuedAt: "2026-11-12T00:00:00.000Z",
  inputUrl: `https://jellyfin.example/Items/${itemId}/Download`,
  videoFileName: `${itemId}.mp4`,
  item: { Id: itemId, Name: itemId, Type: "Movie" } as BaseItemDto,
  mediaSource: {},
  maxBitrate: { key: "Max", value: undefined },
  deviceId: "device",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDownloader.getActiveDownloads.mockResolvedValue([]);
  mockDownloader.enqueueDownload.mockResolvedValue(-1);
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// Android keeps its pauses in memory. After a process death the queued record was re-enqueued
// into a native queue that no longer knew of the pause, and started behind the user's back.
it("hands native a forgotten pause before it re-enqueues anything", async () => {
  const { useDownloadReconciliation, pending } = load();
  pending.savePendingDownload(record("queued-item", "queued"));
  pending.savePendingDownload(record("paused-item", "paused"));
  const setProcesses = jest.fn();

  await renderHook(() => useDownloadReconciliation({ setProcesses }));
  await waitFor(() => expect(setProcesses).toHaveBeenCalled());

  expect(mockDownloader.restorePausedDownload).toHaveBeenCalledWith(
    "paused-item",
    record("paused-item", "paused").inputUrl,
    expect.stringMatching(/paused-item\.mp4$/),
  );
  expect(
    mockDownloader.restorePausedDownload.mock.invocationCallOrder[0],
  ).toBeLessThan(mockDownloader.enqueueDownload.mock.invocationCallOrder[0]);
  const [update] = setProcesses.mock.calls[0];
  expect(
    update([]).map((job: { id: string; status: string }) => [
      job.id,
      job.status,
    ]),
  ).toEqual(
    expect.arrayContaining([
      ["paused-item", "paused"],
      ["queued-item", "queued"],
    ]),
  );
});

// A resume that native started just before the app died never got to mark the record as
// downloading. Its transfer finished while JS was dead; restoring the pause hid the finished
// video and offered to download it again.
it("finalizes a paused record whose video finished while the app was dead", async () => {
  const { useDownloadReconciliation, pending, database, fakeFiles, DOCUMENTS } =
    load();
  pending.savePendingDownload(record("finished-item", "paused"));
  fakeFiles.add(`${DOCUMENTS}/finished-item.mp4`);
  fakeFiles.setSize(`${DOCUMENTS}/finished-item.mp4`, 1234);
  const setProcesses = jest.fn();
  const onDataChange = jest.fn();

  await renderHook(() =>
    useDownloadReconciliation({ setProcesses, onDataChange }),
  );
  await waitFor(() => expect(onDataChange).toHaveBeenCalled());

  expect(pending.getPendingDownload("finished-item")).toBeUndefined();
  expect(
    database.getAllDownloadedItems().map((item) => item.videoFileSize),
  ).toEqual([1234]);
  expect(mockDownloader.restorePausedDownload).not.toHaveBeenCalled();
  expect(setProcesses).not.toHaveBeenCalled();
});
