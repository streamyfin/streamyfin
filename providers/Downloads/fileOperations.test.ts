import { DOCUMENTS, fakeFiles } from "@/test-utils/fileSystem";
import type { PendingDownload } from "./pendingDownloads";
import type { DownloadedItem } from "./types";

jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
// Downloads and pending records the cleanup must leave alone.
let mockDownloaded: unknown[] = [];
let mockPending: unknown[] = [];
let mockDatabaseError: Error | undefined;
jest.mock("./database", () => ({
  getAllDownloadedItems: () => {
    if (mockDatabaseError) throw mockDatabaseError;
    return mockDownloaded;
  },
  getDownloadedItemById: () => undefined,
}));
jest.mock("./pendingDownloads", () => ({
  getPendingDownloads: () => mockPending,
}));

import {
  deleteAllAssociatedFiles,
  deletePendingDownloadFiles,
} from "./fileOperations";

const VIDEO = `${DOCUMENTS}/show_s01e01.mp4`;
const SUBTITLE_2 = `${DOCUMENTS}/show_s01e01_subtitle_2.subrip`;
const SUBTITLE_3 = `${DOCUMENTS}/show_s01e01_subtitle_3.subrip`;
const TRICKPLAY = `${DOCUMENTS}/show_s01e01_trickplay`;
const SIDECARS = [SUBTITLE_2, SUBTITLE_3, TRICKPLAY, `${TRICKPLAY}/0.jpg`];

// generateFilename turns this into "show_s01e01", the stem of every name above.
const episode = {
  Id: "item-1",
  Name: "Neverland",
  Type: "Episode",
  SeriesName: "Show",
  ParentIndexNumber: 1,
  IndexNumber: 1,
} as const;

function makeRecord(overrides: Partial<PendingDownload> = {}): PendingDownload {
  return {
    itemId: "item-1",
    status: "downloading",
    enqueuedAt: "2026-10-04T12:00:00.000Z",
    inputUrl: "https://jellyfin.example/Items/item-1/Download",
    videoFileName: "show_s01e01.mp4",
    item: episode,
    mediaSource: {
      MediaStreams: [
        {
          Type: "Subtitle",
          DeliveryMethod: "External",
          Index: 2,
          Codec: "subrip",
          // Rewritten to the local copy by downloadSubtitles before the video is enqueued.
          DeliveryUrl: SUBTITLE_2,
        },
        {
          Type: "Subtitle",
          DeliveryMethod: "External",
          Index: 3,
          Codec: "subrip",
          DeliveryUrl: SUBTITLE_3,
        },
        // An embedded stream has no sidecar file to remove.
        { Type: "Subtitle", DeliveryMethod: "Embed", Index: 4 },
      ],
    },
    maxBitrate: { key: "Max", value: undefined },
    deviceId: "device",
    // downloadTrickplayImages stores `Directory.uri`, which ends in a slash.
    trickPlayData: { path: `${TRICKPLAY}/`, size: 1024 },
    ...overrides,
  } as PendingDownload;
}

function makeDownloaded(
  overrides: Partial<DownloadedItem> = {},
): DownloadedItem {
  const record = makeRecord();
  return {
    item: record.item,
    mediaSource: record.mediaSource,
    videoFilePath: VIDEO,
    videoFileSize: 1,
    videoFileName: record.videoFileName,
    trickPlayData: record.trickPlayData,
    userData: {
      audioStreamIndex: 0,
      subtitleStreamIndex: -1,
      isTranscoded: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  fakeFiles.clear();
  mockDownloaded = [];
  mockPending = [];
  mockDatabaseError = undefined;
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("deletePendingDownloadFiles", () => {
  // Cancelling a download dropped the pending record but left everything the enqueue step had
  // already written.
  it("removes the subtitles and the trickplay folder of a cancelled download", () => {
    fakeFiles.add(...SIDECARS);

    deletePendingDownloadFiles(makeRecord());

    expect(fakeFiles.remaining()).toEqual([]);
  });

  // Android stages the transfer in `<name>.part` (OkHttpDownloadManager.kt). Native removes it
  // on cancel and on error, but a process killed mid-transfer leaves it for this cleanup.
  it("removes the staging file a killed Android transfer left behind", () => {
    fakeFiles.add(`${VIDEO}.part`);

    deletePendingDownloadFiles(makeRecord());

    expect(fakeFiles.deleted()).toEqual([`${VIDEO}.part`]);
  });

  it("removes a video that landed at its final path", () => {
    fakeFiles.add(VIDEO);

    deletePendingDownloadFiles(makeRecord());

    expect(fakeFiles.deleted()).toEqual([VIDEO]);
  });

  // The subtitle download failed, so DeliveryUrl still points at the server, but on Android
  // File.downloadFileAsync streams into the destination and leaves what it got. Left there,
  // the next attempt finds the file and takes the truncated copy for the real one.
  it("removes the partial file of a subtitle whose download failed", () => {
    fakeFiles.add(SUBTITLE_2);

    deletePendingDownloadFiles(
      makeRecord({
        mediaSource: {
          MediaStreams: [
            {
              Type: "Subtitle",
              DeliveryMethod: "External",
              Index: 2,
              Codec: "subrip",
              DeliveryUrl: "/Videos/item-1/item-1/Subtitles/2/0/Stream.subrip",
            },
          ],
        },
      }),
    );

    expect(fakeFiles.deleted()).toEqual([SUBTITLE_2]);
  });

  it("cleans up after a start that failed before the record was saved", () => {
    fakeFiles.add(...SIDECARS);
    const { itemId, item, mediaSource } = makeRecord();

    deletePendingDownloadFiles({ itemId, item, mediaSource });

    expect(fakeFiles.remaining()).toEqual([]);
  });

  it("does nothing when nothing was written", () => {
    deletePendingDownloadFiles(
      makeRecord({ mediaSource: {}, trickPlayData: undefined }),
    );

    expect(fakeFiles.deleted()).toEqual([]);
  });

  // Cleanup runs on failure paths (native error, lost download), where a throw would skip the
  // error handling that follows it.
  describe("never throws", () => {
    it("still removes what it can when a file cannot be deleted", () => {
      fakeFiles.add(SUBTITLE_2, TRICKPLAY);
      fakeFiles.lock(SUBTITLE_2);

      expect(() => deletePendingDownloadFiles(makeRecord())).not.toThrow();
      expect(fakeFiles.deleted()).toEqual([TRICKPLAY]);
    });

    // Without the other downloads there is no telling which files are shared, so nothing goes.
    it("deletes nothing when the downloads database cannot be read", () => {
      fakeFiles.add(...SIDECARS);
      mockDatabaseError = new SyntaxError("Unexpected end of JSON input");

      expect(() => deletePendingDownloadFiles(makeRecord())).not.toThrow();
      expect(fakeFiles.deleted()).toEqual([]);
    });
  });

  // The names come from the item, never from a stored DeliveryUrl, so nothing the server puts
  // in one can steer the cleanup to another file.
  describe("only removes files the app wrote", () => {
    it.each([
      ["a server path", "/Videos/item-1/item-1/Subtitles/2/0/Stream.subrip"],
      ["a local file elsewhere", "file:///elsewhere/other_subtitle_2.subrip"],
      ["another download's subtitle", `${DOCUMENTS}/other_subtitle_2.subrip`],
      ["a parent directory", `${DOCUMENTS}/..`],
    ])("ignores a DeliveryUrl that names %s", (_label, deliveryUrl) => {
      fakeFiles.add(
        `${DOCUMENTS}/Stream.subrip`,
        `${DOCUMENTS}/other_subtitle_2.subrip`,
        `${DOCUMENTS}/..`,
      );

      deletePendingDownloadFiles(
        makeRecord({
          mediaSource: {
            MediaStreams: [
              {
                Type: "Subtitle",
                DeliveryMethod: "External",
                Index: 2,
                Codec: "subrip",
                DeliveryUrl: deliveryUrl,
              },
            ],
          },
        }),
      );

      expect(fakeFiles.deleted()).toEqual([]);
    });

    // For item types other than Movie and Episode the file name is the Jellyfin item id, and
    // the subtitle extension is the stream's codec: both are the server's to choose.
    it.each([
      ["an item id with a parent-directory prefix", "../../Library/x", "srt"],
      ["an item id with a nested path", "sub/dir", "srt"],
      ["a codec with a path in it", "item-9", "srt/../../../Library/x"],
    ])("builds no sidecar name from %s", (_label, id, codec) => {
      fakeFiles.add(
        `${DOCUMENTS}/../../Library/x_trickplay`,
        `${DOCUMENTS}/sub/dir_trickplay`,
        `${DOCUMENTS}/item-9_subtitle_2.srt/../../../Library/x`,
      );

      deletePendingDownloadFiles(
        makeRecord({
          videoFileName: "plain.mp4",
          item: { Id: id, Type: "Video" },
          mediaSource: {
            MediaStreams: [
              {
                Type: "Subtitle",
                DeliveryMethod: "External",
                Index: 2,
                Codec: codec,
              },
            ],
          },
        }),
      );

      expect(fakeFiles.deleted()).toEqual([]);
    });

    it.each([
      ["a parent-directory prefix", "../../Library/secret.mp4"],
      ["a nested path", "sub/dir.mp4"],
      ["a bare parent directory", ".."],
      ["an empty name", ""],
    ])("never deletes a video file name with %s", (_label, videoFileName) => {
      fakeFiles.add(
        `${DOCUMENTS}/../../Library/secret.mp4`,
        `${DOCUMENTS}/../../Library/secret.mp4.part`,
        `${DOCUMENTS}/sub/dir.mp4`,
        `${DOCUMENTS}/..`,
        `${DOCUMENTS}/.part`,
      );

      deletePendingDownloadFiles(makeRecord({ videoFileName }));

      expect(fakeFiles.deleted()).toEqual([]);
    });
  });

  // generateFilename maps different items to the same name (movies of one title and year,
  // episodes of series that normalise alike), so a cancelled download can share every file name
  // with another one.
  describe("leaves files that belong to another download alone", () => {
    const everyFile = [VIDEO, `${VIDEO}.part`, ...SIDECARS];
    const sameNames = { ...episode, Id: "item-2" };

    it("keeps the files of a finished download with the same names", () => {
      fakeFiles.add(...everyFile);
      mockDownloaded = [makeDownloaded({ item: sameNames })];

      deletePendingDownloadFiles(makeRecord());

      expect(fakeFiles.deleted()).toEqual([]);
    });

    // A download saved before videoFileName existed only carries the path.
    it("keeps the video of a finished download that has no videoFileName", () => {
      fakeFiles.add(VIDEO);
      mockDownloaded = [
        makeDownloaded({ item: sameNames, videoFileName: undefined }),
      ];

      deletePendingDownloadFiles(makeRecord());

      expect(fakeFiles.deleted()).toEqual([]);
    });

    it("keeps the files of another pending download with the same names", () => {
      fakeFiles.add(...everyFile);
      mockPending = [makeRecord({ itemId: "item-2", item: sameNames })];

      deletePendingDownloadFiles(makeRecord());

      expect(fakeFiles.deleted()).toEqual([]);
    });

    it("keeps the files of a finished download of the same item (a re-download)", () => {
      fakeFiles.add(...everyFile);
      mockDownloaded = [makeDownloaded()];

      deletePendingDownloadFiles(makeRecord());

      expect(fakeFiles.deleted()).toEqual([]);
    });

    it("ignores its own pending record", () => {
      fakeFiles.add(...SIDECARS);
      mockPending = [makeRecord()];

      deletePendingDownloadFiles(makeRecord());

      expect(fakeFiles.remaining()).toEqual([]);
    });
  });
});

describe("deleteAllAssociatedFiles", () => {
  // The stored trickplay path ends in a slash, and taking its last segment gave "": the folder
  // of every deleted download stayed on disk.
  it("removes the video, the subtitles and the trickplay folder", () => {
    fakeFiles.add(VIDEO, ...SIDECARS);

    deleteAllAssociatedFiles(makeDownloaded());

    expect(fakeFiles.remaining()).toEqual([]);
  });

  // deleteFileByType deletes the files before it takes the item out of the database.
  it("is not held back by the item's own database entry", () => {
    fakeFiles.add(VIDEO, ...SIDECARS);
    mockDownloaded = [makeDownloaded()];

    deleteAllAssociatedFiles(makeDownloaded());

    expect(fakeFiles.remaining()).toEqual([]);
  });

  it.each([
    [
      "finished",
      () => {
        mockDownloaded = [
          makeDownloaded({ item: { ...episode, Id: "item-2" } }),
        ];
      },
    ],
    [
      "pending",
      () => {
        mockPending = [makeRecord({ itemId: "item-2" })];
      },
    ],
  ])(
    "keeps the files a %s download with the same names still uses",
    (_label, arrange) => {
      fakeFiles.add(VIDEO, ...SIDECARS);
      arrange();

      deleteAllAssociatedFiles(makeDownloaded());

      expect(fakeFiles.deleted()).toEqual([]);
    },
  );
});
