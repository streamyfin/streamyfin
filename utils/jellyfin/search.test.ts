import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { logAndCaptureError } from "@/utils/log";
import {
  getStudioItems,
  nextStartIndex,
  rankByName,
  searchPeople,
  searchStudios,
} from "./search";

jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

/** The one request the api sent: its path and its query. */
const sentRequest = (api: ReturnType<typeof makeApi>) => {
  expect(api.mock.history.get).toHaveLength(1);
  const url = new URL(api.mock.history.get[0].url ?? "");
  return { path: url.pathname, query: url.searchParams };
};

afterEach(() => {
  jest.clearAllMocks();
});

const person = (name: string): BaseItemDto => ({
  Id: name,
  Type: "Person",
  Name: name,
});
const namesOf = (items: { Name?: string | null }[]) =>
  items.map((item) => item.Name);

describe("searchPeople", () => {
  // A music library registers its artists as people, so the item search this
  // replaced listed musicians under a search for an actor.
  test("asks Jellyfin 12 for people, musicians excluded", async () => {
    const api = makeApi({ Items: [person("Tom Hanks")] });

    const people = await searchPeople({
      api,
      userId: "user-1",
      query: "tom",
      serverVersion: "12.1.0",
    });

    expect(namesOf(people)).toEqual(["Tom Hanks"]);
    const { path, query } = sentRequest(api);
    expect(path).toBe("/Persons");
    expect(query.get("searchTerm")).toBe("tom");
    expect(query.get("userId")).toBe("user-1");
    expect(query.getAll("excludePersonTypes")).toEqual([
      "Artist",
      "AlbumArtist",
    ]);
    expect(query.has("personTypes")).toBe(false);
  });

  // Jellyfin 10.11 ignores the exclusion, and keeps no one when it gets both
  // lists, so it is sent the types to keep and nothing else.
  test.each([["10.11.11"], [undefined]])(
    "asks server %s for every type but the musicians",
    async (serverVersion) => {
      const api = makeApi({ Items: [] });

      await searchPeople({ api, query: "tom", serverVersion });

      const { query } = sentRequest(api);
      const kept = query.getAll("personTypes");
      expect(kept).toEqual(expect.arrayContaining(["Actor", "Director"]));
      expect(kept).not.toContain("Artist");
      expect(kept).not.toContain("AlbumArtist");
      expect(query.has("excludePersonTypes")).toBe(false);
    },
  );

  // The Persons API answers in name order at best, so more are asked for than
  // shown and the closest names are the ones kept.
  test("keeps the ten closest of the people the server lists", async () => {
    const fillers = Array.from({ length: 12 }, (_, index) =>
      person(`Atom ${String(index).padStart(2, "0")}`),
    );
    const api = makeApi({ Items: [...fillers, person("Tom Hanks")] });

    const people = await searchPeople({ api, query: "tom" });

    expect(sentRequest(api).query.get("limit")).toBe("100");
    expect(people).toHaveLength(10);
    expect(people[0].Name).toBe("Tom Hanks");
  });

  test("sends nothing for an empty search", async () => {
    const api = makeApi({ Items: [] });

    expect(await searchPeople({ api, query: "" })).toEqual([]);
    expect(await searchPeople({ api: null, query: "tom" })).toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  test("shows no people and reports it when the server fails", async () => {
    const api = makeApi();
    api.mock.onGet().reply(500);

    expect(await searchPeople({ api, query: "tom" })).toEqual([]);
    expect(logAndCaptureError).toHaveBeenCalledTimes(1);
  });

  test("stays quiet when the next keystroke aborts the request", async () => {
    // An answer is ready, so an empty result can only come from the abort.
    const api = makeApi({ Items: [person("Tom Hanks")] });
    const controller = new AbortController();
    controller.abort();

    const people = await searchPeople({
      api,
      query: "tom",
      signal: controller.signal,
    });

    expect(people).toEqual([]);
    expect(logAndCaptureError).not.toHaveBeenCalled();
  });
});

describe("rankByName", () => {
  test("puts the name itself first, then a leading, then a later word", () => {
    const ranked = rankByName(
      [
        person("Atom Egoyan"),
        person("Tim Tom"),
        person("Tommy Lee Jones"),
        person("Tom"),
      ],
      " TOM ",
    );

    expect(namesOf(ranked)).toEqual([
      "Tom",
      "Tommy Lee Jones",
      "Tim Tom",
      "Atom Egoyan",
    ]);
  });

  test("keeps the server's order among equal matches", () => {
    const ranked = rankByName(
      [person("Tom Zed"), person("Tom Abel"), { Id: "nameless" }],
      "tom",
    );

    expect(namesOf(ranked)).toEqual(["Tom Zed", "Tom Abel", undefined]);
  });
});

describe("searchStudios", () => {
  // A music library's record labels are studios too; their page lists only
  // movies and series, so it would open empty.
  test("asks the Studios API for studios with a movie or a series", async () => {
    const studio = { Id: "studio-1", Type: "Studio", Name: "Pixar" };
    const api = makeApi({ Items: [studio] });

    const studios = await searchStudios({
      api,
      userId: "user-1",
      query: "pix",
    });

    expect(studios).toEqual([studio]);
    const { path, query } = sentRequest(api);
    expect(path).toBe("/Studios");
    expect(query.get("searchTerm")).toBe("pix");
    expect(query.getAll("includeItemTypes")).toEqual(["Movie", "Series"]);
    expect(query.get("userId")).toBe("user-1");
    expect(query.get("limit")).toBe("10");
  });

  test("shows no studios and reports it when the server fails", async () => {
    const api = makeApi();
    api.mock.onGet().reply(500);

    expect(await searchStudios({ api, query: "pix" })).toEqual([]);
    expect(logAndCaptureError).toHaveBeenCalledTimes(1);
  });
});

describe("getStudioItems", () => {
  test("asks for the studio's movies and series across every library", async () => {
    const page = { Items: [{ Id: "movie-1" }], TotalRecordCount: 40 };
    const api = makeApi(page);

    const result = await getStudioItems({
      api,
      userId: "user-1",
      studioId: "studio-1",
      startIndex: 18,
      limit: 18,
    });

    expect(result).toEqual(page);
    const { path, query } = sentRequest(api);
    expect(path).toBe("/Items");
    expect(query.get("studioIds")).toBe("studio-1");
    expect(query.getAll("includeItemTypes")).toEqual(["Movie", "Series"]);
    expect(query.get("recursive")).toBe("true");
    // The server's "group movies into collections" must not swap box sets in.
    expect(query.get("collapseBoxSetItems")).toBe("false");
    expect(query.get("startIndex")).toBe("18");
    expect(query.get("limit")).toBe("18");
  });
});

describe("nextStartIndex", () => {
  const page = (count: number, total: number) => ({
    Items: Array.from({ length: count }, (_, index) => ({ Id: `${index}` })),
    TotalRecordCount: total,
  });

  test("starts the next page after everything loaded so far", () => {
    expect(nextStartIndex([page(18, 40)])).toBe(18);
    expect(nextStartIndex([page(18, 40), page(18, 40)])).toBe(36);
  });

  test("stops once every item is loaded", () => {
    expect(nextStartIndex([page(18, 22), page(4, 22)])).toBeUndefined();
    expect(nextStartIndex([page(18, 18)])).toBeUndefined();
  });

  // A total that the pages never reach would otherwise ask forever.
  test("stops on an empty or missing page whatever the total says", () => {
    expect(nextStartIndex([page(18, 40), page(0, 40)])).toBeUndefined();
    expect(nextStartIndex([null])).toBeUndefined();
    expect(nextStartIndex([])).toBeUndefined();
  });
});
