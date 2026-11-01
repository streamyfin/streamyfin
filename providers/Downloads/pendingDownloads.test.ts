import { DOCUMENTS } from "@/test-utils/fileSystem";
import { clearMmkv } from "@/test-utils/mmkv";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

import {
  getPendingDownload,
  markVideoDone,
  type PendingDownload,
  pendingDownloadFileUri,
  savePendingDownload,
  storeDownloadAssets,
} from "./pendingDownloads";

const record = (videoFileName: string) =>
  ({ itemId: "item-1", videoFileName }) as PendingDownload;

describe("the video file of a pending download", () => {
  it("is the stored name, directly in Documents", () => {
    expect(pendingDownloadFileUri(record("show_s01e01.mp4"))).toBe(
      `${DOCUMENTS}/show_s01e01.mp4`,
    );
  });

  // The name is read back from storage, and a record saved before the name builders cleaned
  // what the server sends can still carry a path. Re-enqueueing such a record would hand
  // native a destination outside Documents, and finalizing it would store that path as the
  // download's video, which a later delete then removes.
  it.each([
    ["a parent-directory prefix", "../../Library/x.mp4"],
    ["a nested path", "sub/dir.mp4"],
    ["a backslash", "sub\\dir.mp4"],
    ["only a parent directory", ".."],
    ["nothing in it", ""],
  ])("is refused when the stored name has %s", (_label, videoFileName) => {
    expect(() => pendingDownloadFileUri(record(videoFileName))).toThrow();
  });
});

// The video is handed to native before its extras (trickplay sheets, subtitles, segments) are
// in, so either can finish first. The download is ready to finalize once both have.
describe("a download whose extras come in after its video starts", () => {
  beforeEach(() => clearMmkv());

  const pending = (): PendingDownload =>
    ({
      itemId: "item-1",
      status: "downloading",
      videoFileName: "show_s01e01.mp4",
      mediaSource: { Id: "source" },
      assetsPending: true,
    }) as PendingDownload;

  it("waits for its extras when the video finishes first", () => {
    savePendingDownload(pending());

    expect(markVideoDone("item-1", 1000, false)).toBeUndefined();
    expect(getPendingDownload("item-1")).toMatchObject({
      videoFileSize: 1000,
      videoTranscoded: false,
    });

    expect(
      storeDownloadAssets("item-1", {
        updatedMediaSource: { Id: "source", Path: "local" },
        trickPlayData: { path: "trickplay/", size: 10 },
      }),
    ).toMatchObject({
      assetsPending: false,
      videoFileSize: 1000,
      mediaSource: { Path: "local" },
      trickPlayData: { size: 10 },
    });
  });

  it("is ready as soon as the video finishes when its extras are in", () => {
    savePendingDownload(pending());

    expect(
      storeDownloadAssets("item-1", { updatedMediaSource: { Id: "source" } }),
    ).toBeUndefined();
    expect(markVideoDone("item-1", 1000)).toMatchObject({
      assetsPending: false,
      videoFileSize: 1000,
    });
  });

  // A download started before this change has no assetsPending at all: its extras came first.
  it("is ready at once for a record that never waited for its extras", () => {
    savePendingDownload({ ...pending(), assetsPending: undefined });

    expect(markVideoDone("item-1", 1000)).toMatchObject({
      videoFileSize: 1000,
    });
  });

  it("has nothing to store once the download is gone", () => {
    expect(
      storeDownloadAssets("item-1", { updatedMediaSource: { Id: "source" } }),
    ).toBeUndefined();
    expect(markVideoDone("item-1", 1000)).toBeUndefined();
  });
});
