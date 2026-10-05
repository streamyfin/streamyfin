import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  getLibraryContainerTabs,
  getLibraryTabFilters,
  getLibraryTabQuery,
  getVisibleLibraryTabs,
} from "./libraryTabs";

const library = (CollectionType?: BaseItemDto["CollectionType"]) =>
  ({ Type: "CollectionFolder", CollectionType }) satisfies BaseItemDto;

describe("the tabs a library can have", () => {
  test("a movie or a series library has collections and playlists", () => {
    expect(getLibraryContainerTabs(library("movies"), "12.0.0")).toEqual([
      "collections",
      "playlists",
    ]);
    expect(getLibraryContainerTabs(library("tvshows"), "12.0.0")).toEqual([
      "collections",
      "playlists",
    ]);
  });

  test("a mixed library, which has no collection type, has both", () => {
    expect(getLibraryContainerTabs(library(), "12.0.0")).toEqual([
      "collections",
      "playlists",
    ]);
  });

  test("follows jellyfin-web for the narrower library types", () => {
    expect(getLibraryContainerTabs(library("musicvideos"), "12.0.0")).toEqual([
      "playlists",
    ]);
    expect(getLibraryContainerTabs(library("books"), "12.0.0")).toEqual([
      "collections",
    ]);
  });

  test("the collections and playlists libraries have no tabs of their own", () => {
    expect(getLibraryContainerTabs(library("boxsets"), "12.0.0")).toEqual([]);
    expect(getLibraryContainerTabs(library("playlists"), "12.0.0")).toEqual([]);
    expect(getLibraryContainerTabs(library("homevideos"), "12.0.0")).toEqual(
      [],
    );
  });

  // Jellyfin 10.11 ignores the library for a BoxSet query: every library would
  // list every collection on the server.
  test("a server older than Jellyfin 12 has none", () => {
    expect(getLibraryContainerTabs(library("movies"), "10.11.11")).toEqual([]);
    expect(getLibraryContainerTabs(library("movies"), undefined)).toEqual([]);
  });

  // TV opens a playlist through the library screen. A playlist has no
  // collection type either, and must not pass for a mixed library.
  test("a playlist opened through the library screen has none", () => {
    expect(getLibraryContainerTabs({ Type: "Playlist" }, "12.0.0")).toEqual([]);
  });
});

describe("the tabs that are drawn", () => {
  test("hides a tab that holds nothing", () => {
    expect(
      getVisibleLibraryTabs(["collections", "playlists"], {
        collections: 3,
        playlists: 0,
      }),
    ).toEqual(["items", "collections"]);
  });

  test("hides a tab whose count has not answered yet", () => {
    expect(
      getVisibleLibraryTabs(["collections", "playlists"], { playlists: 2 }),
    ).toEqual(["items", "playlists"]);
  });

  test("leaves the items alone when nothing else has content", () => {
    expect(getVisibleLibraryTabs(["collections"], { collections: 0 })).toEqual([
      "items",
    ]);
    expect(getVisibleLibraryTabs([], {})).toEqual(["items"]);
  });
});

describe("the request behind a tab", () => {
  test("the items tab keeps the single type of its library", () => {
    expect(getLibraryTabQuery("items", library("movies"), false)).toEqual({
      includeItemTypes: ["Movie"],
    });
    expect(getLibraryTabQuery("items", library("tvshows"), false)).toEqual({
      includeItemTypes: ["Series"],
    });
  });

  test("the items tab of a mixed library asks for every type", () => {
    expect(getLibraryTabQuery("items", library(), false)).toEqual({
      includeItemTypes: undefined,
    });
  });

  test("the other tabs only change the type", () => {
    expect(getLibraryTabQuery("collections", library("movies"), false)).toEqual(
      { includeItemTypes: ["BoxSet"] },
    );
    expect(getLibraryTabQuery("playlists", library("movies"), false)).toEqual({
      includeItemTypes: ["Playlist"],
    });
  });

  // TV cannot play music: the playlists library already asked for video
  // playlists only there, and the tab has to agree with it.
  test("TV asks for video playlists only, in the tab and in the playlists library", () => {
    expect(getLibraryTabQuery("playlists", library("movies"), true)).toEqual({
      includeItemTypes: ["Playlist"],
      mediaTypes: ["Video"],
    });
    expect(getLibraryTabQuery("items", library("playlists"), true)).toEqual({
      includeItemTypes: ["Playlist"],
      mediaTypes: ["Video"],
    });
    expect(getLibraryTabQuery("collections", library("movies"), true)).toEqual({
      includeItemTypes: ["BoxSet"],
    });
  });
});

describe("the filter bar", () => {
  const filterBar = {
    sortBy: ["DateCreated" as const],
    sortOrder: ["Descending" as const],
    genres: ["Action"],
    years: [1999],
  };

  test("applies to the items tab as it is", () => {
    expect(getLibraryTabFilters("items", filterBar)).toEqual(filterBar);
  });

  // The bar is hidden on these tabs and its genres are those of the movies:
  // with a saved filter, a tab the count calls non-empty would open empty.
  test("is ignored by the collections and playlists tabs, sorted by name", () => {
    const byName = { sortBy: ["SortName"], sortOrder: ["Ascending"] };
    expect(getLibraryTabFilters("collections", filterBar)).toEqual(byName);
    expect(getLibraryTabFilters("playlists", filterBar)).toEqual(byName);
  });
});
