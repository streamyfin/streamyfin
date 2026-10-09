import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  fetchLanguageFilters,
  getLanguageFilterItemTypes,
  getLanguageFilterLabel,
  languageFilterRequestOptions,
  withSelectedLanguages,
} from "./languageFilters";

// What a request looks like once axios has put its own params on the URL.
const sentQuery = (api: ReturnType<typeof makeApi>) => {
  const [request] = api.mock.history.get;
  return new URL(api.axiosInstance.getUri(request)).searchParams;
};

describe("the libraries that can be filtered by language", () => {
  test.each([
    ["a movie library", { CollectionType: "movies" }, ["Movie"]],
    ["a show library", { CollectionType: "tvshows" }, ["Series"]],
    ["a mixed library", { Type: "CollectionFolder" }, ["Movie", "Series"]],
  ] as const)("offers the filters on %s", (_name, library, itemTypes) => {
    expect(getLanguageFilterItemTypes(library)).toEqual(itemTypes);
  });

  test.each([
    ["a music library", { Type: "CollectionFolder", CollectionType: "music" }],
    ["a collection library", { CollectionType: "boxsets" }],
    // The library screen also renders a playlist, which has no collection
    // type either and must not pass for a mixed library.
    ["a playlist", { Type: "Playlist" }],
    ["a library that has not loaded", null],
  ] as const)("does not offer them on %s", (_name, library) => {
    expect(getLanguageFilterItemTypes(library)).toBeNull();
  });
});

describe("the languages of a library", () => {
  test("asks Filters2 with the item types, without which the lists come back empty", async () => {
    const api = makeApi({ AudioLanguages: [], SubtitleLanguages: [] });

    await fetchLanguageFilters(api, {
      userId: "user-1",
      parentId: "movies",
      includeItemTypes: ["Movie"],
    });

    const [request] = api.mock.history.get;
    expect(new URL(request.url ?? "").pathname).toBe("/Items/Filters2");
    expect(sentQuery(api).get("parentId")).toBe("movies");
    expect(sentQuery(api).getAll("includeItemTypes")).toEqual(["Movie"]);
  });

  test("keeps the server's tag as the value and its name as the label", async () => {
    const api = makeApi({
      AudioLanguages: [
        { Name: "English (eng)", Value: "eng" },
        // A tag the server found no culture for is its own name.
        { Name: "qaa", Value: "qaa" },
        { Name: null, Value: "und" },
        // Nothing to filter on.
        { Name: "Broken", Value: null },
      ],
      SubtitleLanguages: [{ Name: "Swedish (swe)", Value: "swe" }],
    });

    expect(
      await fetchLanguageFilters(api, {
        parentId: "movies",
        includeItemTypes: ["Movie"],
      }),
    ).toEqual({
      audio: [
        { value: "eng", label: "English (eng)" },
        { value: "qaa", label: "qaa" },
        { value: "und", label: "und" },
      ],
      subtitle: [{ value: "swe", label: "Swedish (swe)" }],
    });
  });

  test("is empty when the server answers without the lists", async () => {
    // Filters2 before Jellyfin 12.
    const api = makeApi({ Genres: [], Tags: [] });

    expect(
      await fetchLanguageFilters(api, {
        parentId: "movies",
        includeItemTypes: ["Movie"],
      }),
    ).toEqual({ audio: [], subtitle: [] });
  });

  // Otherwise the multi-select sheet has no row to untick it with, and the
  // library stays filtered on a language nobody can see.
  test("keeps a saved language the library no longer has, under its tag", () => {
    const options = [{ value: "eng", label: "English (eng)" }];

    const offered = withSelectedLanguages(options, ["jpn", "eng"]);

    expect(offered).toEqual([...options, { value: "jpn", label: "jpn" }]);
    expect(getLanguageFilterLabel(offered, "eng")).toBe("English (eng)");
    expect(getLanguageFilterLabel(offered, "jpn")).toBe("jpn");
    // Same list back when nothing is missing: the filter bar memoizes on it.
    expect(withSelectedLanguages(options, ["eng"])).toBe(options);
  });
});

describe("the selected languages on an items request", () => {
  // SDK 0.13 drops a parameter it does not know when it is cast onto the
  // request object, so this goes through the real SDK down to the URL.
  test("reach the server as comma delimited query parameters", async () => {
    const api = makeApi({ Items: [] });

    await getItemsApi(api).getItems(
      { parentId: "movies", genres: ["Drama"] },
      languageFilterRequestOptions({
        audioLanguages: ["eng", "swe"],
        subtitleLanguages: ["fre"],
      }),
    );

    const query = sentQuery(api);
    expect(query.get("audioLanguages")).toBe("eng,swe");
    expect(query.get("subtitleLanguages")).toBe("fre");
    // The parameters the SDK does know are still there.
    expect(query.get("parentId")).toBe("movies");
    expect(query.getAll("genres")).toEqual(["Drama"]);
  });

  test("leave the request alone when nothing is selected", async () => {
    const api = makeApi({ Items: [] });
    const options = languageFilterRequestOptions({
      audioLanguages: [],
      subtitleLanguages: [],
    });

    await getItemsApi(api).getItems({ parentId: "movies" }, options);

    expect(options).toBeUndefined();
    expect(sentQuery(api).has("audioLanguages")).toBe(false);
    expect(sentQuery(api).has("subtitleLanguages")).toBe(false);
  });

  test("send only the filter that has a selection", () => {
    expect(
      languageFilterRequestOptions({
        audioLanguages: [],
        subtitleLanguages: ["swe"],
      }),
    ).toEqual({ params: { subtitleLanguages: "swe" } });
  });
});
