import { PLAY_QUEUE_MAX_ITEMS } from "@/constants/Playback";
import {
  buildLibraryItemsQuery,
  buildLibraryQueueQuery,
  isQueueableLibrary,
  type LibraryItemsFilter,
  serverSortBy,
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

  // Playback writes played state on the episodes, so a show's own DatePlayed
  // never changes; the series-level key reads the episodes' dates.
  test("sorts a Shows library by the series date played", () => {
    expect(
      buildLibraryItemsQuery({
        ...horrorMovies,
        collectionType: "tvshows",
        sortBy: "DatePlayed",
        serverVersion: "12.2.0",
      }).sortBy,
    ).toEqual(["SeriesDatePlayed", "SortName", "ProductionYear"]);
  });

  // The library page and the collections screen both send their sort through
  // serverSortBy: only Date Played in a Shows library or view changes, and
  // only on a server that sorts by the series key quickly (not 10.11).
  test.each([
    ["tvshows", "DatePlayed", "12.2.0", "SeriesDatePlayed"],
    ["tvshows", "DatePlayed", "10.10.7", "SeriesDatePlayed"],
    ["tvshows", "DatePlayed", "10.11.6", "DatePlayed"],
    ["tvshows", "DatePlayed", undefined, "DatePlayed"],
    ["tvshows", "DateLastContentAdded", "12.2.0", "DateLastContentAdded"],
    ["movies", "DatePlayed", "12.2.0", "DatePlayed"],
    ["boxsets", "DatePlayed", "12.2.0", "DatePlayed"],
    [undefined, "DatePlayed", "12.2.0", "DatePlayed"],
  ] as const)(
    "a %s view asks a %s sort of a %s server as %s",
    (collectionType, sortBy, serverVersion, expected) => {
      expect(serverSortBy(sortBy, collectionType, serverVersion)).toBe(
        expected,
      );
    },
  );
});
