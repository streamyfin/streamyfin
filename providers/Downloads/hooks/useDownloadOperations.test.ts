import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { DOCUMENTS, fakeFiles } from "@/test-utils/fileSystem";
import { clearMmkv } from "@/test-utils/mmkv";

// The pending records are real, over the MMKV double: they are what cancel reads its files from.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
const mockDownloader = {
  enqueueDownload: jest.fn(),
  cancelDownload: jest.fn(),
  cancelQueuedDownload: jest.fn(),
};
jest.mock("@/modules", () => ({
  get BackgroundDownloader() {
    return mockDownloader;
  },
}));
const mockDownloadAdditionalAssets = jest.fn();
jest.mock("../additionalDownloads", () => ({
  downloadAdditionalAssets: (...args: unknown[]) =>
    mockDownloadAdditionalAssets(...args),
}));
const mockBuildDownloadActivityMetadata = jest.fn();
jest.mock("../liveActivity", () => ({
  buildDownloadActivityMetadata: () => mockBuildDownloadActivityMetadata(),
}));
jest.mock("@/hooks/useImageStorage", () => ({
  __esModule: true,
  default: () => ({ saveImage: jest.fn() }),
}));
jest.mock("@/utils/download", () => ({
  __esModule: true,
  default: () => ({ saveSeriesPrimaryImage: jest.fn() }),
}));
jest.mock("@/utils/customHeaders", () => ({
  getJellyfinHeadersForUrl: () => undefined,
}));
jest.mock("@/utils/device", () => ({ getOrSetDeviceId: () => "device" }));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
jest.mock("react-native-device-info", () => ({}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import { toast } from "sonner-native";
import { getPendingDownload, savePendingDownload } from "../pendingDownloads";
import { useDownloadOperations } from "./useDownloadOperations";

const SUBTITLE = `${DOCUMENTS}/show_s01e01_subtitle_2.subrip`;
const TRICKPLAY = `${DOCUMENTS}/show_s01e01_trickplay`;
const SIDECARS = [SUBTITLE, TRICKPLAY, `${TRICKPLAY}/0.jpg`];

const item: BaseItemDto = {
  Id: "item-1",
  Name: "Neverland",
  Type: "Episode",
  SeriesName: "Show",
  ParentIndexNumber: 1,
  IndexNumber: 1,
};
const mediaSource: MediaSourceInfo = {
  MediaStreams: [
    {
      Type: "Subtitle",
      DeliveryMethod: "External",
      Index: 2,
      Codec: "subrip",
      DeliveryUrl: SUBTITLE,
    },
  ],
};
const url = "https://jellyfin.example/Items/item-1/Download";
const maxBitrate = { key: "Max", value: undefined };

const renderOperations = async () => {
  const removeProcess = jest.fn();
  const setProcesses = jest.fn();
  const { result } = await renderHook(() =>
    useDownloadOperations({
      processes: [],
      setProcesses,
      removeProcess,
      api: { basePath: "https://jellyfin.example" },
      authHeader: "token",
    }),
  );
  return { operations: result.current, removeProcess, setProcesses };
};

/** A step of the start that stays pending until the test lets it through. */
const hold = <T>() => {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

/** What downloadAdditionalAssets does before the video is handed to native. */
const writeSidecars = () => {
  fakeFiles.add(...SIDECARS);
  return {
    updatedMediaSource: mediaSource,
    trickPlayData: { path: `${TRICKPLAY}/`, size: 1 },
  };
};

beforeEach(() => {
  clearMmkv();
  fakeFiles.clear();
  jest.clearAllMocks();
  mockDownloader.enqueueDownload.mockResolvedValue(7);
  mockBuildDownloadActivityMetadata.mockResolvedValue(undefined);
  mockDownloadAdditionalAssets.mockImplementation(async () => writeSidecars());
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("cancelDownload", () => {
  // Cancelling only stopped the transfer and dropped the record: the subtitles and trickplay
  // sheets written before the video was enqueued stayed in Documents.
  it("removes the files the download had already written", async () => {
    const { operations, removeProcess } = await renderOperations();
    await act(() =>
      operations.startBackgroundDownload(url, item, mediaSource, maxBitrate),
    );
    expect(fakeFiles.remaining()).toEqual(SIDECARS);

    await act(() => operations.cancelDownload("item-1"));

    expect(mockDownloader.cancelDownload).toHaveBeenCalledWith(7);
    expect(getPendingDownload("item-1")).toBeUndefined();
    expect(removeProcess).toHaveBeenCalledWith("item-1");
    expect(fakeFiles.remaining()).toEqual([]);
  });

  // A download that already finished has no pending record. Its card lingers for a moment, and
  // cancelling it then must not take the finished download's files.
  it("deletes nothing when there is no pending record", async () => {
    fakeFiles.add(...SIDECARS);
    const { operations } = await renderOperations();

    await act(() => operations.cancelDownload("item-1"));

    expect(fakeFiles.deleted()).toEqual([]);
  });

  // The card, and its cancel button, is on screen before the pending record is saved: staging
  // the Live Activity poster sits in between. A cancel in that window found no record, so it
  // cancelled nothing, and the start then saved the record and enqueued a download that ran
  // with no card.
  describe("while the download is still being prepared", () => {
    it("enqueues nothing and removes what the start had written", async () => {
      const staging = hold<undefined>();
      mockBuildDownloadActivityMetadata.mockReturnValue(staging.promise);
      const { operations, setProcesses } = await renderOperations();

      const started = operations.startBackgroundDownload(
        url,
        item,
        mediaSource,
        maxBitrate,
      );
      await waitFor(() => expect(setProcesses).toHaveBeenCalled());
      await act(() => operations.cancelDownload("item-1"));
      staging.release(undefined);
      await act(() => started);

      expect(mockDownloader.enqueueDownload).not.toHaveBeenCalled();
      expect(getPendingDownload("item-1")).toBeUndefined();
      expect(fakeFiles.remaining()).toEqual([]);
      expect(toast.success).not.toHaveBeenCalled();
    });

    // Native has the download by the time enqueueDownload resolves, but the record carries no
    // task id until then, so the cancel could only try the queue.
    it("stops a download native started while it was being cancelled", async () => {
      const enqueue = hold<number>();
      mockDownloader.enqueueDownload.mockReturnValue(enqueue.promise);
      const { operations } = await renderOperations();

      const started = operations.startBackgroundDownload(
        url,
        item,
        mediaSource,
        maxBitrate,
      );
      await waitFor(() =>
        expect(mockDownloader.enqueueDownload).toHaveBeenCalled(),
      );
      await act(() => operations.cancelDownload("item-1"));
      expect(mockDownloader.cancelDownload).not.toHaveBeenCalled();
      enqueue.release(7);
      await act(() => started);

      expect(mockDownloader.cancelDownload).toHaveBeenCalledWith(7);
      expect(getPendingDownload("item-1")).toBeUndefined();
      expect(fakeFiles.remaining()).toEqual([]);
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("takes a download native queued while it was being cancelled back out", async () => {
      const enqueue = hold<number>();
      mockDownloader.enqueueDownload.mockReturnValue(enqueue.promise);
      const { operations } = await renderOperations();

      const started = operations.startBackgroundDownload(
        url,
        item,
        mediaSource,
        maxBitrate,
      );
      await waitFor(() =>
        expect(mockDownloader.enqueueDownload).toHaveBeenCalled(),
      );
      await act(() => operations.cancelDownload("item-1"));
      mockDownloader.cancelQueuedDownload.mockClear();
      // -1 is what native answers when the download waits behind another one.
      enqueue.release(-1);
      await act(() => started);

      expect(mockDownloader.cancelQueuedDownload).toHaveBeenCalledWith(url);
      expect(getPendingDownload("item-1")).toBeUndefined();
    });

    // The cancelled start only notices once its staging step returns. Its cleanup used to run
    // then, and took the subtitles and trickplay sheets a new start of the item had reused.
    it("leaves the files of a new start of the item alone", async () => {
      const cancelledStaging = hold<undefined>();
      const nextStaging = hold<undefined>();
      mockBuildDownloadActivityMetadata
        .mockReturnValueOnce(cancelledStaging.promise)
        .mockReturnValueOnce(nextStaging.promise);
      const { operations, setProcesses } = await renderOperations();

      const cancelled = operations.startBackgroundDownload(
        url,
        item,
        mediaSource,
        maxBitrate,
      );
      await waitFor(() => expect(setProcesses).toHaveBeenCalledTimes(1));
      await act(() => operations.cancelDownload("item-1"));
      expect(fakeFiles.remaining()).toEqual([]);

      const next = operations.startBackgroundDownload(
        url,
        item,
        mediaSource,
        maxBitrate,
      );
      await waitFor(() => expect(setProcesses).toHaveBeenCalledTimes(2));
      cancelledStaging.release(undefined);
      await act(() => cancelled);
      nextStaging.release(undefined);
      await act(() => next);

      expect(mockDownloader.enqueueDownload).toHaveBeenCalledTimes(1);
      expect(getPendingDownload("item-1")).toMatchObject({ taskId: 7 });
      expect(fakeFiles.remaining()).toEqual(SIDECARS);
    });

    // The user cancelled and was told so. A start that fails after that is not a failed start.
    it("does not report a failure when native refuses the cancelled download", async () => {
      let refuse!: (error: Error) => void;
      mockDownloader.enqueueDownload.mockReturnValue(
        new Promise<number>((_resolve, reject) => {
          refuse = reject;
        }),
      );
      const { operations } = await renderOperations();

      const started = operations.startBackgroundDownload(
        url,
        item,
        mediaSource,
        maxBitrate,
      );
      await waitFor(() =>
        expect(mockDownloader.enqueueDownload).toHaveBeenCalled(),
      );
      await act(() => operations.cancelDownload("item-1"));
      refuse(new Error("no session"));

      await expect(act(() => started)).resolves.not.toThrow();
      expect(toast.error).not.toHaveBeenCalled();
      expect(fakeFiles.remaining()).toEqual([]);
    });

    it("does not hold the cancel against the next download of the item", async () => {
      const staging = hold<undefined>();
      mockBuildDownloadActivityMetadata.mockReturnValueOnce(staging.promise);
      const { operations, setProcesses } = await renderOperations();
      const started = operations.startBackgroundDownload(
        url,
        item,
        mediaSource,
        maxBitrate,
      );
      await waitFor(() => expect(setProcesses).toHaveBeenCalled());
      await act(() => operations.cancelDownload("item-1"));
      staging.release(undefined);
      await act(() => started);

      await act(() =>
        operations.startBackgroundDownload(url, item, mediaSource, maxBitrate),
      );

      expect(mockDownloader.enqueueDownload).toHaveBeenCalledTimes(1);
      expect(getPendingDownload("item-1")).toMatchObject({ taskId: 7 });
      expect(fakeFiles.remaining()).toEqual(SIDECARS);
    });
  });
});

describe("startBackgroundDownload", () => {
  const start = async () => {
    const { operations } = await renderOperations();
    let failure: unknown;
    await act(async () => {
      try {
        await operations.startBackgroundDownload(
          url,
          item,
          mediaSource,
          maxBitrate,
        );
      } catch (error) {
        failure = error;
      }
    });
    return failure;
  };

  it("removes what it wrote when native refuses the download", async () => {
    mockDownloader.enqueueDownload.mockRejectedValue(new Error("no session"));

    expect(await start()).toEqual(new Error("no session"));

    expect(getPendingDownload("item-1")).toBeUndefined();
    expect(fakeFiles.remaining()).toEqual([]);
  });

  // The pending record is only saved once every sidecar is in place, so a failure before that
  // has no record to say what was written.
  it("removes what it wrote when it fails before the record is saved", async () => {
    mockDownloadAdditionalAssets.mockImplementation(async () => {
      writeSidecars();
      throw new Error("disk full");
    });

    expect(await start()).toEqual(new Error("disk full"));

    expect(mockDownloader.enqueueDownload).not.toHaveBeenCalled();
    expect(fakeFiles.remaining()).toEqual([]);
  });

  // Until its assets are written a start has neither a card nor a pending record, so a second
  // start of the item got through. A cancel then only reached one of the two, and the other
  // enqueued a download that ran with no card.
  it("refuses a second start of an item that is still being prepared", async () => {
    const assets = hold<ReturnType<typeof writeSidecars>>();
    mockDownloadAdditionalAssets.mockReturnValueOnce(assets.promise);
    const { operations, setProcesses } = await renderOperations();

    const first = operations.startBackgroundDownload(
      url,
      item,
      mediaSource,
      maxBitrate,
    );
    await waitFor(() =>
      expect(mockDownloadAdditionalAssets).toHaveBeenCalled(),
    );
    await act(() =>
      operations.startBackgroundDownload(url, item, mediaSource, maxBitrate),
    );
    expect(toast.info).toHaveBeenCalledWith(
      "home.downloads.toasts.item_already_downloading",
    );

    assets.release(writeSidecars());
    await act(() => first);

    expect(mockDownloadAdditionalAssets).toHaveBeenCalledTimes(1);
    expect(setProcesses).toHaveBeenCalledTimes(1);
    expect(mockDownloader.enqueueDownload).toHaveBeenCalledTimes(1);
  });

  it("leaves a download of the same item that is already in flight alone", async () => {
    fakeFiles.add(...SIDECARS);
    savePendingDownload({
      itemId: "item-1",
      status: "downloading",
      enqueuedAt: "2026-10-04T12:00:00.000Z",
      inputUrl: url,
      videoFileName: "show_s01e01.mp4",
      item,
      mediaSource,
      maxBitrate: { key: "Max", value: undefined },
      deviceId: "device",
    });

    expect(await start()).toBeUndefined();

    expect(mockDownloadAdditionalAssets).not.toHaveBeenCalled();
    expect(fakeFiles.deleted()).toEqual([]);
  });
});
