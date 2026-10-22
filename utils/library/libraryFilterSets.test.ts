import { CollectionType } from "@jellyfin/sdk/lib/generated-client/models";
import { SortByOption, sortOptions } from "@/utils/atoms/filters";
import { getLanguageFilterItemTypes } from "@/utils/jellyfin/languageFilters";
import {
  effectiveSelection,
  type FilterGroupKey,
  filterByOptionsFor,
  filterGroupsFor,
  type LibraryKind,
  libraryFilterSetFor,
  libraryKindFor,
  pruneFilters,
  sortOptionsFor,
} from "./libraryFilterSets";
import {
  buildLibraryItemsQuery,
  buildLibraryQueueQuery,
  type LibraryItemsFilter,
  libraryLanguageOptions,
} from "./libraryItemsQuery";
import { resolveSortKey } from "./sortOption";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// settings.ts drags in the provider stack; only the sort constants are used.
jest.mock("@/utils/atoms/settings", () => ({}));

const keysOf = (kind: LibraryKind) => sortOptionsFor(kind).map((o) => o.key);
const labelOf = (kind: LibraryKind, key: SortByOption) =>
  sortOptionsFor(kind).find((o) => o.key === key)?.value;

// A new SDK collection type fails here until it is given a row.
const ALL_KINDS: LibraryKind[] = [
  ...(Object.values(CollectionType) as LibraryKind[]),
  "mixed",
  "boxsets",
];

const emptyFilters = {
  genres: [] as string[],
  officialRatings: [] as string[],
  years: [] as string[],
  tags: [] as string[],
  audioLanguages: [] as string[],
  subtitleLanguages: [] as string[],
  filterBy: [] as string[],
};

describe("libraryKindFor", () => {
  test("uses the collection type when the library has one", () => {
    expect(
      libraryKindFor({ Type: "CollectionFolder", CollectionType: "movies" }),
    ).toBe("movies");
    expect(libraryKindFor({ CollectionType: "tvshows" })).toBe("tvshows");
  });

  test("names a box set and a playlist, which have no collection type", () => {
    expect(libraryKindFor({ Type: "BoxSet" })).toBe("boxsets");
    expect(libraryKindFor({ Type: "Playlist" })).toBe("playlists");
  });

  test("a collection folder without a type is a mixed library", () => {
    expect(libraryKindFor({ Type: "CollectionFolder" })).toBe("mixed");
  });

  // Permissive, so nothing flickers while the library loads.
  test.each([null, undefined, {}])("treats %p as mixed", (item) => {
    expect(libraryKindFor(item)).toBe("mixed");
  });
});

describe("the per type sets", () => {
  test.each(ALL_KINDS)("%s has a row", (kind) => {
    const set = libraryFilterSetFor(kind);
    expect(set.sort.length).toBeGreaterThan(0);
    expect(set.groups.length).toBeGreaterThan(0);
    expect(set.filterBy.length).toBeGreaterThan(0);
  });

  test.each(ALL_KINDS)("%s lists Default first, each with a label", (kind) => {
    const options = sortOptionsFor(kind);
    expect(options[0].key).toBe(SortByOption.Default);
    for (const option of options) {
      expect(option.value).toBeTruthy();
    }
    for (const key of libraryFilterSetFor(kind).sort) {
      expect(keysOf(kind)).toContain(key);
    }
  });

  test("movies drop what jellyfin-web does not offer for them", () => {
    for (const key of [
      SortByOption.DateLastContentAdded,
      SortByOption.AirTime,
      SortByOption.StartDate,
      SortByOption.IndexNumber,
      SortByOption.Studio,
      SortByOption.PremiereDate,
    ]) {
      expect(keysOf("movies")).not.toContain(key);
    }
    expect(keysOf("movies")).toEqual([
      SortByOption.Default,
      SortByOption.SortName,
      SortByOption.Random,
      SortByOption.CommunityRating,
      SortByOption.CriticRating,
      SortByOption.DateCreated,
      SortByOption.DatePlayed,
      SortByOption.OfficialRating,
      SortByOption.PlayCount,
      SortByOption.ProductionYear,
      SortByOption.Runtime,
    ]);
  });

  test("shows sort by episode activity and have no critic rating, play count or runtime", () => {
    expect(labelOf("tvshows", SortByOption.DateLastContentAdded)).toBe(
      "Date Episode Added",
    );
    expect(labelOf("tvshows", SortByOption.DateCreated)).toBe(
      "Date Show Added",
    );
    for (const key of [
      SortByOption.CriticRating,
      SortByOption.PlayCount,
      SortByOption.Runtime,
    ]) {
      expect(keysOf("tvshows")).not.toContain(key);
    }
  });

  test("playlists word the container date for a playlist", () => {
    expect(labelOf("playlists", SortByOption.DateLastContentAdded)).toBe(
      "Date Playlist Updated",
    );
    expect(labelOf("playlists", SortByOption.DateCreated)).toBe("Date Added");
  });

  test("box sets, home videos and music videos follow their rows", () => {
    expect(keysOf("boxsets")).toEqual([
      SortByOption.Default,
      SortByOption.SortName,
      SortByOption.Random,
      SortByOption.CommunityRating,
      SortByOption.DateCreated,
      SortByOption.OfficialRating,
      SortByOption.ProductionYear,
      SortByOption.PremiereDate,
    ]);
    expect(keysOf("homevideos")).toEqual(keysOf("musicvideos"));
    expect(keysOf("homevideos")).toContain(SortByOption.Runtime);
    expect(keysOf("homevideos")).not.toContain(
      SortByOption.DateLastContentAdded,
    );
  });

  // The collections screen writes PremiereDate as the default sort of a box
  // set or playlist with no DisplayOrder of its own.
  test.each(["boxsets", "playlists"] as const)(
    "%s keep the collections screen's default sort",
    (kind) => {
      expect(
        resolveSortKey(SortByOption.PremiereDate, sortOptionsFor(kind)),
      ).toBe(SortByOption.PremiereDate);
    },
  );

  test("a mixed library gets the web list, container date included", () => {
    expect(keysOf("mixed")).toContain(SortByOption.DateLastContentAdded);
    expect(keysOf("mixed")).toContain(SortByOption.CriticRating);
    expect(keysOf("mixed")).not.toContain(SortByOption.Studio);
  });

  // The music sort UI is a later PR: these must not lose an option.
  test.each([
    "music",
    "books",
    "photos",
    "trailers",
    "livetv",
    "folders",
    "unknown",
  ] as const)("%s keeps today's full list", (kind) => {
    expect(sortOptionsFor(kind)).toBe(sortOptions);
    expect(filterGroupsFor(kind)).toEqual([
      "genres",
      "years",
      "tags",
      "officialRatings",
      "filterBy",
    ]);
  });

  test("keeps the filter by choices of today for every kind", () => {
    for (const kind of ALL_KINDS) {
      expect(filterByOptionsFor(kind)).toEqual([
        "IsFavoriteOrLikes",
        "IsUnplayed",
        "IsPlayed",
        "IsFavorite",
        "IsResumable",
      ]);
    }
  });

  test("hands back the same list on every call", () => {
    for (const kind of ALL_KINDS) {
      expect(sortOptionsFor(kind)).toBe(sortOptionsFor(kind));
    }
  });

  // The group set and the Filters2 gate are two statements of one rule; this
  // pins them together. A library that is not loaded yet reads as mixed and
  // keeps the groups, but has no item types, so no language request.
  test.each([
    [{ Type: "CollectionFolder", CollectionType: "movies" }],
    [{ Type: "CollectionFolder", CollectionType: "tvshows" }],
    [{ Type: "CollectionFolder" }],
    [{ Type: "CollectionFolder", CollectionType: "music" }],
    [{ Type: "CollectionFolder", CollectionType: "homevideos" }],
    [{ Type: "CollectionFolder", CollectionType: "musicvideos" }],
    [{ Type: "CollectionFolder", CollectionType: "boxsets" }],
    [{ Type: "BoxSet" }],
    [{ Type: "Playlist" }],
    [{ Type: "CollectionFolder", CollectionType: "playlists" }],
    [{ Type: "CollectionFolder", CollectionType: "books" }],
  ] as const)("language groups match the Filters2 gate for %j", (library) => {
    const groups = filterGroupsFor(libraryKindFor(library));
    const hasTypes = getLanguageFilterItemTypes(library) !== null;
    expect(groups.includes("audioLanguages")).toBe(hasTypes);
    expect(groups.includes("subtitleLanguages")).toBe(hasTypes);
  });

  test("movies and shows offer every group", () => {
    const all: FilterGroupKey[] = [
      "genres",
      "years",
      "tags",
      "officialRatings",
      "audioLanguages",
      "subtitleLanguages",
      "filterBy",
    ];
    expect(filterGroupsFor("movies")).toEqual(all);
    expect(filterGroupsFor("tvshows")).toEqual(all);
  });
});

describe("pruneFilters", () => {
  test("keeps the groups the kind shows", () => {
    const filters = { ...emptyFilters, genres: ["Horror"], years: ["1999"] };
    expect(pruneFilters("movies", filters)).toBe(filters);
  });

  test("drops the values of a hidden group", () => {
    const filters = {
      ...emptyFilters,
      genres: ["Horror"],
      audioLanguages: ["eng"],
      subtitleLanguages: ["swe"],
    };
    const pruned = pruneFilters("boxsets", filters);
    expect(pruned.genres).toEqual(["Horror"]);
    expect(pruned.audioLanguages).toEqual([]);
    expect(pruned.subtitleLanguages).toEqual([]);
  });

  test("hands back the same reference when nothing is hidden or set", () => {
    expect(pruneFilters("boxsets", emptyFilters)).toBe(emptyFilters);
  });
});

// The maintainer asked for this: a sort or filter saved in one kind of library
// must not reach the server from a kind that does not offer it, and must not
// be wiped from the saved preference either (that is not this layer's job).
describe("a stale saved selection", () => {
  const selection = {
    ...emptyFilters,
    sortBy: [SortByOption.DateLastContentAdded],
  };
  const requestFor = (
    kind: LibraryKind,
    collectionType: LibraryItemsFilter["collectionType"],
    saved: typeof selection,
  ): LibraryItemsFilter => {
    const own = effectiveSelection(kind, saved);
    return {
      libraryId: "lib",
      collectionType,
      sortBy: own.sortBy[0],
      sortOrder: "Ascending",
      filterBy: own.filterBy as LibraryItemsFilter["filterBy"],
      genres: own.genres,
      officialRatings: own.officialRatings,
      years: own.years,
      tags: own.tags,
      audioLanguages: own.audioLanguages,
      subtitleLanguages: own.subtitleLanguages,
    };
  };

  test("a saved episode date resolves to Name on a movies library and is sent as SortName", () => {
    expect(resolveSortKey(selection.sortBy[0], sortOptionsFor("movies"))).toBe(
      SortByOption.SortName,
    );

    const query = buildLibraryItemsQuery(
      requestFor("movies", "movies", selection),
    );
    expect(query.sortBy?.[0]).toBe("SortName");
  });

  test("the same saved sort stays valid on a shows library", () => {
    const query = buildLibraryItemsQuery(
      requestFor("tvshows", "tvshows", selection),
    );
    expect(query.sortBy?.[0]).toBe("DateLastContentAdded");
  });

  test("does not rewrite the saved selection", () => {
    effectiveSelection("movies", selection);
    expect(selection.sortBy).toEqual([SortByOption.DateLastContentAdded]);
  });

  test("a hidden filter is absent from the query, the language request and Play All", () => {
    const stale = { ...selection, tags: ["4K"], audioLanguages: ["eng"] };
    const filter = requestFor("boxsets", "boxsets", stale);

    expect(filter.audioLanguages).toEqual([]);
    expect(libraryLanguageOptions(filter)).toBeUndefined();
    for (const query of [
      buildLibraryItemsQuery(filter),
      buildLibraryQueueQuery(filter, { shuffle: false }),
    ]) {
      // A group the kind shows still filters.
      expect(query.tags).toEqual(["4K"]);
    }
    expect(buildLibraryQueueQuery(filter, { shuffle: false }).sortBy?.[0]).toBe(
      "SortName",
    );
    expect(
      libraryLanguageOptions(requestFor("movies", "movies", stale)),
    ).toBeDefined();
  });

  test("a hidden filter value never reaches the query", () => {
    const hidden = effectiveSelection("music", {
      ...selection,
      audioLanguages: ["eng"],
      subtitleLanguages: ["swe"],
    });
    expect(hidden.audioLanguages).toEqual([]);
    expect(hidden.subtitleLanguages).toEqual([]);
  });
});
