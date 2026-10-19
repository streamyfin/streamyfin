import { PLAY_QUEUE_MAX_ITEMS } from "@/constants/Playback";
import {
  buildLibraryItemsQuery,
  buildLibraryQueueQuery,
  isQueueableLibrary,
  type LibraryItemsFilter,
} from "./libraryItemsQuery";

const horrorMovies: LibraryItemsFilter = {
  userId: "user-1",
  libraryId: "library-1",
  collectionType: "movies",
  sortBy: "CommunityRating",
  sortOrder: "Descending",
  filterBy: ["IsUnplayed"],
  genres: ["Horror"],
  years: ["1999"],
  tags: ["4K"],
};

describe("library items query", () => {
  test("lists only the kind of item the library is for, with the filters applied", () => {
    expect(buildLibraryItemsQuery(horrorMovies)).toEqual({
      userId: "user-1",
      parentId: "library-1",
      sortBy: ["CommunityRating", "SortName", "ProductionYear"],
      sortOrder: ["Descending"],
      filters: ["IsUnplayed"],
      recursive: true,
      genres: ["Horror"],
      tags: ["4K"],
      years: [1999],
      includeItemTypes: ["Movie"],
    });
  });

  test("Play All queues the list on screen, minus what cannot be played, up to the cap", () => {
    const queue = buildLibraryQueueQuery(horrorMovies, { shuffle: false });

    expect(queue).toMatchObject({
      ...buildLibraryItemsQuery(horrorMovies),
      filters: ["IsUnplayed", "IsNotFolder"],
      mediaTypes: ["Video"],
      collapseBoxSetItems: false,
      excludeLocationTypes: ["Virtual"],
      limit: PLAY_QUEUE_MAX_ITEMS,
    });
  });

  test("Shuffle asks the server for a random order of the same filtered list", () => {
    const queue = buildLibraryQueueQuery(horrorMovies, { shuffle: true });

    expect(queue.sortBy).toEqual(["Random"]);
    expect(queue.sortOrder).toBeUndefined();
    expect(queue).toMatchObject({
      parentId: "library-1",
      filters: ["IsUnplayed", "IsNotFolder"],
      genres: ["Horror"],
      years: [1999],
      tags: ["4K"],
      includeItemTypes: ["Movie"],
      limit: PLAY_QUEUE_MAX_ITEMS,
    });
  });

  // The filters of a series library select series, not episodes, so there is
  // no list of videos to hand to the player.
  test.each([
    ["movies", true],
    ["homevideos", true],
    ["musicvideos", true],
    [undefined, true],
    ["tvshows", false],
    ["boxsets", false],
    ["playlists", false],
    ["music", false],
  ] as const)("a %s library can be queued: %s", (collectionType, expected) => {
    expect(isQueueableLibrary(collectionType)).toBe(expected);
  });
});
