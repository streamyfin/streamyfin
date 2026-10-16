import { fakeFiles } from "@/test-utils/fileSystem";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
const mockStartDownload = jest.fn(async (..._args: unknown[]) => 1);
jest.mock("@/modules", () => ({
  BackgroundDownloader: {
    startDownload: (...args: unknown[]) => mockStartDownload(...args),
    addCompleteListener: () => ({ remove() {} }),
    addErrorListener: () => ({ remove() {} }),
  },
}));

import { downloadTrack } from "./index";

/** The path native is told to write the track to. */
const destinationOf = async (
  itemId: string,
  container: string | undefined,
  permanent = true,
) => {
  await downloadTrack(itemId, "https://jellyfin.example/Audio/stream", {
    permanent,
    container,
  });
  return mockStartDownload.mock.calls.at(-1)?.[1];
};

beforeEach(() => {
  fakeFiles.clear();
  mockStartDownload.mockClear();
});

// AudioStorage remembers every id it has started, so each case downloads an id of its own.
describe("where a track is downloaded to", () => {
  // A stored track is found again by the path saved in the index, but the name a real server
  // leads to should not change either.
  it.each([
    [
      "a permanent download",
      true,
      "/documents/streamyfin-audio/0a1B2c3d4e5f60718293a4b5c6d7e8f9.flac",
    ],
    [
      "a look-ahead cache entry",
      false,
      "/cache/streamyfin-audio-cache/0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9.flac",
    ],
  ])(
    "is named after the item and its container, for %s",
    async (_label, permanent, path) => {
      const id = path.slice(path.lastIndexOf("/") + 1, -".flac".length);

      expect(await destinationOf(id, "FLAC", permanent)).toBe(path);
    },
  );

  it("falls back to m4a when the server names no container", async () => {
    expect(await destinationOf("no-container", undefined)).toBe(
      "/documents/streamyfin-audio/no-container.m4a",
    );
  });

  // The item id and the container are the server's to choose, and native replaces whatever is
  // already at the path it is handed. A separator or a parent-directory segment in either used
  // to steer the track out of the audio directory.
  it.each([
    [
      "an item id with a parent-directory prefix",
      "../../Documents/x",
      "mp3",
      "______Documents_x.mp3",
    ],
    ["an item id with a nested path", "sub/dir", "mp3", "sub_dir.mp3"],
    ["an item id with a backslash", "sub\\dir", "mp3", "sub_dir.mp3"],
    [
      "a container with a path in it",
      "item-9",
      "mp3/../../../Library/x",
      "item-9.mp3__________library_x",
    ],
    ["a container that is a parent directory", "item-10", "..", "item-10.__"],
  ])(
    "is a plain file in the audio directory, given %s",
    async (_label, id, container, name) => {
      expect(await destinationOf(id, container)).toBe(
        `/documents/streamyfin-audio/${name}`,
      );
    },
  );
});
