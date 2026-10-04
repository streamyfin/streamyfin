import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { TFunction } from "i18next";
import { setJellyfinHeaders } from "@/test-utils/customHeaders";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";

// The Live Activity only exists on the iPhone and the iPad.
stubReactNative({ OS: "ios", isTV: false });
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
// No proxy headers in these specs.
beforeEach(() => setJellyfinHeaders());
jest.mock("@/modules", () => ({
  BackgroundDownloader: {
    // The native side hands back a plain path, not a file:// URI.
    getLiveActivityDirectory: () => "/app-group/LiveActivity",
  },
}));

// Fake expo-file-system that records download calls instead of hitting disk.
const downloads: { url: string; destination: string }[] = [];

class mockFakeDirectory {
  uri: string;
  exists = true;
  constructor(uri: string) {
    this.uri = uri;
  }
  create() {}
  list() {
    return [];
  }
}
class mockFakeFile {
  uri: string;
  constructor(directory: mockFakeDirectory, name: string) {
    this.uri = `${directory.uri}/${name}`;
  }
  static downloadFileAsync = async (url: string, destination: mockFakeFile) => {
    downloads.push({ url, destination: destination.uri });
    return destination;
  };
}
// jest.mock is hoisted above the class declarations, so the classes are read
// through getters: by the time the module under test touches them, their
// temporal dead zone is over.
jest.mock("expo-file-system", () => ({
  get Directory() {
    return mockFakeDirectory;
  },
  get File() {
    return mockFakeFile;
  },
}));

// liveActivity.ts reads Platform when it loads, so it is required after the stub above.
const { buildDownloadActivityMetadata } =
  require("./liveActivity") as typeof import("./liveActivity");

const api = makeApi();
const t = ((key: string) => key) as unknown as TFunction;

const stage = (item: BaseItemDto) =>
  buildDownloadActivityMetadata({ item, api, t });

beforeEach(() => {
  downloads.length = 0;
});

describe("the poster staged for the download Live Activity", () => {
  // The widget extension loads the poster by the name it is handed, so a real id has to give
  // the name it always gave.
  test.each([
    ["a plain id", "0a1B2c3d4e5f60718293a4b5c6d7e8f9"],
    ["an id in the dashed GUID form", "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9"],
  ])("is named after the item, given %s", async (_label, id) => {
    const metadata = await stage({
      Id: id,
      Type: "Movie",
      Name: "Some Movie",
      ImageTags: { Primary: "tag-1" },
    });

    expect(downloads).toEqual([
      {
        url: `https://jellyfin.example.com/Items/${id}/Images/Primary?quality=90&tag=tag-1&width=300`,
        destination: `file:///app-group/LiveActivity/${id}.jpg`,
      },
    ]);
    expect(metadata?.posterFileName).toBe(`${id}.jpg`);
  });

  // The item id is the server's to choose, for every item type, and the write overwrites what
  // is already there. A separator or a parent-directory segment in it used to steer the poster
  // out of the Live Activity directory and onto another file.
  test.each<[string, BaseItemDto, string]>([
    [
      "a parent-directory prefix",
      { Id: "../../Documents/x", Type: "Movie" },
      "______Documents_x.jpg",
    ],
    ["a nested path", { Id: "sub/dir", Type: "Movie" }, "sub_dir.jpg"],
    ["a backslash", { Id: "sub\\dir", Type: "Movie" }, "sub_dir.jpg"],
    ["only a parent directory", { Id: "..", Type: "Movie" }, "__.jpg"],
    [
      "a path, on an episode",
      { Id: "../escape", Type: "Episode", SeriesId: "series-1" },
      "___escape.jpg",
    ],
    [
      "a path, on another item type",
      { Id: "../escape", Type: "Video" },
      "___escape.jpg",
    ],
  ])(
    "is a plain file in the Live Activity directory when the item id has %s",
    async (_label, item, name) => {
      const metadata = await stage({
        ...item,
        ImageTags: { Primary: "tag-1" },
      });

      expect(downloads.map((download) => download.destination)).toEqual([
        `file:///app-group/LiveActivity/${name}`,
      ]);
      // The native side opens the poster by this name, so it has to be the name written.
      expect(metadata?.posterFileName).toBe(name);
    },
  );
});
