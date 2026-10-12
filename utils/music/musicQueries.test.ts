import { MUSIC_PLAY_QUEUE_MAX_ITEMS } from "@/constants/Music";
import {
  buildFolderPageQuery,
  buildMusicQueueQuery,
  buildSongsPageQuery,
} from "./musicQueries";

const page = { startIndex: 100, limit: 100 };

describe("the Songs tab", () => {
  it("lists every song below the library by name", () => {
    expect(buildSongsPageQuery("user-1", "library-1", page)).toEqual({
      userId: "user-1",
      parentId: "library-1",
      recursive: true,
      includeItemTypes: ["Audio"],
      sortBy: ["SortName"],
      sortOrder: ["Ascending"],
      startIndex: 100,
      limit: 100,
    });
  });
});

describe("a folder page", () => {
  const query = buildFolderPageQuery("user-1", "folder-1", page);

  it("lists only what is directly in the folder", () => {
    expect(query).toMatchObject({ parentId: "folder-1", recursive: false });
  });

  // A folder holding songs is an album to the server, one holding folders is a
  // folder: a type filter would hide one kind or the other.
  it("asks for every item type", () => {
    expect(query.includeItemTypes).toBeUndefined();
  });

  it("puts the subfolders first, then the songs by name", () => {
    expect(query.sortBy).toEqual(["IsFolder", "SortName"]);
    expect(query.sortOrder).toEqual(["Descending", "Ascending"]);
  });
});

describe("Play all and Shuffle", () => {
  const folder = { userId: "user-1", parentId: "folder-1", recursive: true };

  it("plays songs in the order the song list shows them", () => {
    const query = buildMusicQueueQuery(folder, { shuffle: false });
    expect(query.sortBy).toEqual(["SortName"]);
    expect(query.sortOrder).toEqual(["Ascending"]);
  });

  // Reordering the first page would only ever shuffle the songs that sort first.
  it("lets the server pick a random sample when shuffling", () => {
    const query = buildMusicQueueQuery(folder, { shuffle: true });
    expect(query.sortBy).toEqual(["Random"]);
    expect(query.sortOrder).toBeUndefined();
  });

  it.each([true, false])(
    "queues only songs, capped, with subfolders %s",
    (recursive) => {
      expect(
        buildMusicQueueQuery({ ...folder, recursive }, { shuffle: false }),
      ).toMatchObject({
        parentId: "folder-1",
        recursive,
        includeItemTypes: ["Audio"],
        limit: MUSIC_PLAY_QUEUE_MAX_ITEMS,
      });
    },
  );
});
