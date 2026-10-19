import { DOCUMENTS } from "@/test-utils/fileSystem";

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
  type PendingDownload,
  pendingDownloadFileUri,
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
