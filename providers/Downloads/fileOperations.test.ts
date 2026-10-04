import type { PendingDownload } from "./pendingDownloads";

// Fake expo-file-system: a path exists until it is deleted, and every delete is recorded.
const mockExisting = new Set<string>();
const mockDeleted: string[] = [];
const mockUndeletable = new Set<string>();

class mockFakeEntry {
  uri: string;
  constructor(...parts: (string | mockFakeEntry)[]) {
    this.uri = parts
      .map((p) => (typeof p === "string" ? p : p.uri))
      .map((p) => p.replace(/\/$/, ""))
      .join("/");
  }
  get exists() {
    return mockExisting.has(this.uri);
  }
  delete() {
    if (mockUndeletable.has(this.uri)) throw new Error("EPERM");
    mockExisting.delete(this.uri);
    mockDeleted.push(this.uri);
  }
}
// jest.mock is hoisted above the class declaration, so the module reads it through getters.
jest.mock("expo-file-system", () => ({
  get Directory() {
    return mockFakeEntry;
  },
  get File() {
    return mockFakeEntry;
  },
  Paths: { document: "file:///documents" },
}));
// Downloads and pending records the cleanup must leave alone.
let mockDownloaded: unknown[] = [];
let mockPending: unknown[] = [];
jest.mock("./database", () => ({
  getAllDownloadedItems: () => mockDownloaded,
  getDownloadedItemById: () => undefined,
}));
jest.mock("./pendingDownloads", () => ({
  getPendingDownloads: () => mockPending,
}));

import { deletePendingDownloadFiles } from "./fileOperations";

const DOCS = "file:///documents";

function makeRecord(overrides: Partial<PendingDownload> = {}): PendingDownload {
  return {
    itemId: "item-1",
    status: "downloading",
    enqueuedAt: "2026-10-04T12:00:00.000Z",
    inputUrl: "https://jellyfin.example/Items/item-1/Download",
    videoFileName: "show_s01e01.mp4",
    item: { Id: "item-1", Name: "Neverland" },
    mediaSource: {
      MediaStreams: [
        {
          Type: "Subtitle",
          DeliveryMethod: "External",
          // Rewritten to the local copy by downloadSubtitles before the video is enqueued.
          DeliveryUrl: `${DOCS}/show_s01e01_subtitle_2.subrip`,
        },
        {
          Type: "Subtitle",
          DeliveryMethod: "External",
          DeliveryUrl: `${DOCS}/show_s01e01_subtitle_3.subrip`,
        },
        // An embedded stream has no sidecar file to remove.
        { Type: "Subtitle", DeliveryMethod: "Embed" },
      ],
    },
    maxBitrate: { key: "Max", value: undefined },
    deviceId: "device",
    // downloadTrickplayImages stores `Directory.uri`, which ends in a slash.
    trickPlayData: { path: `${DOCS}/show_s01e01_trickplay/`, size: 1024 },
    ...overrides,
  } as PendingDownload;
}

beforeEach(() => {
  mockExisting.clear();
  mockDeleted.length = 0;
  mockUndeletable.clear();
  mockDownloaded = [];
  mockPending = [];
});

describe("deletePendingDownloadFiles", () => {
  // Cancelling a download dropped the pending record but left everything the enqueue step had
  // already written (subtitles, trickplay sheets) and, on Android, the partial video.
  it("removes the sidecar files and the partial video of a cancelled download", () => {
    for (const path of [
      `${DOCS}/show_s01e01.mp4`,
      `${DOCS}/show_s01e01_subtitle_2.subrip`,
      `${DOCS}/show_s01e01_subtitle_3.subrip`,
      `${DOCS}/show_s01e01_trickplay`,
    ]) {
      mockExisting.add(path);
    }

    deletePendingDownloadFiles(makeRecord());

    expect([...mockExisting]).toEqual([]);
    expect(mockDeleted).toHaveLength(4);
  });

  it("does nothing for files that were never written", () => {
    // iOS stages the transfer in a temp file, so a cancel before completion leaves no video.
    mockExisting.add(`${DOCS}/show_s01e01_trickplay`);

    deletePendingDownloadFiles(makeRecord());

    expect(mockDeleted).toEqual([`${DOCS}/show_s01e01_trickplay`]);
  });

  it("handles a record with no subtitles and no trickplay", () => {
    mockExisting.add(`${DOCS}/show_s01e01.mp4`);

    deletePendingDownloadFiles(
      makeRecord({ mediaSource: {}, trickPlayData: undefined }),
    );

    expect(mockDeleted).toEqual([`${DOCS}/show_s01e01.mp4`]);
  });

  // Cleanup runs on failure paths (native error, lost download), where a throw would skip the
  // error handling that follows it.
  it("never throws, and still removes what it can, when a file cannot be deleted", () => {
    mockExisting.add(`${DOCS}/show_s01e01.mp4`);
    mockExisting.add(`${DOCS}/show_s01e01_trickplay`);
    mockUndeletable.add(`${DOCS}/show_s01e01.mp4`);

    expect(() => deletePendingDownloadFiles(makeRecord())).not.toThrow();
    expect(mockDeleted).toContain(`${DOCS}/show_s01e01_trickplay`);
  });

  // A subtitle whose download failed keeps the server's DeliveryUrl. The cleanup used to take its
  // last segment as a file name in Documents, so the server picked what got deleted.
  describe("only removes files the app wrote", () => {
    it("ignores a subtitle that still points at the server", () => {
      mockExisting.add(`${DOCS}/Stream.subrip`);

      deletePendingDownloadFiles(
        makeRecord({
          mediaSource: {
            MediaStreams: [
              {
                Type: "Subtitle",
                DeliveryMethod: "External",
                DeliveryUrl:
                  "/Videos/item-1/item-1/Subtitles/2/0/Stream.subrip",
              },
            ],
          },
          trickPlayData: undefined,
        }),
      );

      expect(mockDeleted).toEqual([]);
    });

    it.each([
      ["a parent-directory segment", `${DOCS}/..`],
      ["a name the app does not generate", `${DOCS}/mmkv`],
      [
        "a name from outside Documents",
        "file:///elsewhere/other_subtitle_2.subrip/..",
      ],
    ])("ignores a local subtitle path with %s", (_label, deliveryUrl) => {
      mockExisting.add(`${DOCS}/mmkv`);
      mockExisting.add(`${DOCS}/..`);

      deletePendingDownloadFiles(
        makeRecord({
          mediaSource: {
            MediaStreams: [
              {
                Type: "Subtitle",
                DeliveryMethod: "External",
                DeliveryUrl: deliveryUrl,
              },
            ],
          },
          trickPlayData: undefined,
        }),
      );

      expect(mockDeleted).toEqual([]);
    });

    it("ignores a trickplay path that is not the app's trickplay folder", () => {
      mockExisting.add(`${DOCS}/mmkv`);
      mockExisting.add(`${DOCS}/..`);

      for (const path of [`${DOCS}/mmkv/`, `${DOCS}/..`, `${DOCS}/../`]) {
        deletePendingDownloadFiles(
          makeRecord({
            mediaSource: {},
            trickPlayData: { path, size: 1 },
          }),
        );
      }

      expect(mockDeleted).toEqual([]);
    });
  });

  // generateFilename maps different items to the same name (movies of one title and year,
  // episodes of series that normalise alike), so a cancelled download can share every file name
  // with a finished one.
  describe("leaves files that belong to another download alone", () => {
    const everyFile = [
      `${DOCS}/show_s01e01.mp4`,
      `${DOCS}/show_s01e01_subtitle_2.subrip`,
      `${DOCS}/show_s01e01_subtitle_3.subrip`,
      `${DOCS}/show_s01e01_trickplay`,
    ];

    it("keeps the files of a finished download with the same names", () => {
      for (const f of everyFile) mockExisting.add(f);
      const other = makeRecord({ itemId: "item-2" });
      mockDownloaded = [{ ...other, videoFileName: other.videoFileName }];

      deletePendingDownloadFiles(makeRecord());

      expect(mockDeleted).toEqual([]);
    });

    it("keeps the files of another pending download with the same names", () => {
      for (const f of everyFile) mockExisting.add(f);
      mockPending = [makeRecord({ itemId: "item-2" })];

      deletePendingDownloadFiles(makeRecord());

      expect(mockDeleted).toEqual([]);
    });

    it("keeps the files of a finished download of the same item (a re-download)", () => {
      for (const f of everyFile) mockExisting.add(f);
      mockDownloaded = [makeRecord()];

      deletePendingDownloadFiles(makeRecord());

      expect(mockDeleted).toEqual([]);
    });

    it("still removes the names no other download uses", () => {
      for (const f of everyFile) mockExisting.add(f);
      mockExisting.add(`${DOCS}/mine.mp4`);
      mockExisting.add(`${DOCS}/mine_trickplay`);
      // The other download shares the first subtitle only.
      mockPending = [
        makeRecord({
          itemId: "item-2",
          videoFileName: "other.mp4",
          mediaSource: {
            MediaStreams: [
              {
                Type: "Subtitle",
                DeliveryMethod: "External",
                DeliveryUrl: `${DOCS}/show_s01e01_subtitle_2.subrip`,
              },
            ],
          },
          trickPlayData: undefined,
        }),
      ];

      deletePendingDownloadFiles(
        makeRecord({
          videoFileName: "mine.mp4",
          trickPlayData: { path: `${DOCS}/mine_trickplay/`, size: 1 },
        }),
      );

      expect([...mockDeleted].sort()).toEqual(
        [
          `${DOCS}/mine.mp4`,
          `${DOCS}/mine_trickplay`,
          `${DOCS}/show_s01e01_subtitle_3.subrip`,
        ].sort(),
      );
      expect(mockExisting.has(`${DOCS}/show_s01e01_subtitle_2.subrip`)).toBe(
        true,
      );
    });
  });

  // For item types other than Movie and Episode the file name is the Jellyfin item id, which a
  // hostile server chooses.
  it.each([
    ["a parent-directory prefix", "../../Library/secret.mp4"],
    ["a nested path", "sub/dir.mp4"],
    ["a bare parent directory", ".."],
    ["an empty name", ""],
  ])("never deletes a video file name with %s", (_label, videoFileName) => {
    mockExisting.add(`${DOCS}/../../Library/secret.mp4`);
    mockExisting.add(`${DOCS}/sub/dir.mp4`);
    mockExisting.add(`${DOCS}/..`);

    deletePendingDownloadFiles(
      makeRecord({ videoFileName, mediaSource: {}, trickPlayData: undefined }),
    );

    expect(mockDeleted).toEqual([]);
  });
});
