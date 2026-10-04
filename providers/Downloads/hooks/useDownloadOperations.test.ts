import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
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
jest.mock("../liveActivity", () => ({
  buildDownloadActivityMetadata: async () => undefined,
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

const renderOperations = async () => {
  const removeProcess = jest.fn();
  const { result } = await renderHook(() =>
    useDownloadOperations({
      processes: [],
      setProcesses: jest.fn(),
      removeProcess,
      api: { basePath: "https://jellyfin.example" },
      authHeader: "token",
    }),
  );
  return { operations: result.current, removeProcess };
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
      operations.startBackgroundDownload(url, item, mediaSource, {
        key: "Max",
        value: undefined,
      }),
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
});

describe("startBackgroundDownload", () => {
  const start = async () => {
    const { operations } = await renderOperations();
    let failure: unknown;
    await act(async () => {
      try {
        await operations.startBackgroundDownload(url, item, mediaSource, {
          key: "Max",
          value: undefined,
        });
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
