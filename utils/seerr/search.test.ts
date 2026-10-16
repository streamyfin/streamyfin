import { nextResultsPage, searchSeerr, seerrQueryString } from "./search";

const fakeApi = (pages: { id: number }[][] = [[]]) => {
  const calls: { query: string; page: number }[] = [];
  const api = {
    search: async (params: { query: string; page: number }) => {
      calls.push(params);
      return {
        page: params.page,
        totalPages: pages.length,
        results: pages[params.page - 1] ?? [],
      };
    },
  };
  return { api: api as never, calls };
};

describe("searchSeerr", () => {
  // The text used to go through URLSearchParams, which sent "dune=" for
  // "dune": results moved around, and a word still being typed found nothing.
  test("searches for the text as it was typed", async () => {
    const { api, calls } = fakeApi();

    await searchSeerr(api, "noctur");
    await searchSeerr(api, "castlevania noct");

    expect(new Set(calls.map((call) => call.query))).toEqual(
      new Set(["noctur", "castlevania noct"]),
    );
  });

  test("asks only for the pages there are, four at most", async () => {
    const one = fakeApi([[{ id: 1 }]]);
    await searchSeerr(one.api, "castlevania noct");
    expect(one.calls.map((call) => call.page)).toEqual([1]);

    const many = fakeApi(Array.from({ length: 65 }, () => []));
    await searchSeerr(many.api, "dune");
    expect(many.calls.map((call) => call.page).sort()).toEqual([1, 2, 3, 4]);
  });

  test("keeps each result once across the pages", async () => {
    const { api } = fakeApi([
      [{ id: 1 }, { id: 2 }],
      [{ id: 2 }, { id: 3 }],
    ]);

    const results = await searchSeerr(api, "dune");

    expect(results.map((result) => result.id)).toEqual([1, 2, 3]);
  });

  test("finds nothing without a Seerr connection", async () => {
    expect(await searchSeerr(undefined, "dune")).toEqual([]);
  });
});

// Seerr's API refuses a query that still holds a reserved character, and a
// space written as "+" is one: Seerr's own site encodes it as %20.
describe("seerrQueryString", () => {
  test("writes a space as %20", () => {
    expect(seerrQueryString({ query: "castlevania noct", page: 1 })).toBe(
      "query=castlevania%20noct&page=1",
    );
  });

  test("encodes what Seerr's site encodes, and leaves the apostrophe", () => {
    expect(seerrQueryString({ query: "(500) days of summer!" })).toBe(
      "query=%28500%29%20days%20of%20summer%21",
    );
    expect(seerrQueryString({ query: "M*A*S*H" })).toBe("query=M%2AA%2AS%2AH");
    expect(seerrQueryString({ query: "l'été" })).toBe("query=l'%C3%A9t%C3%A9");
  });
});

// The next page of a list Seerr gives a page at a time, none past its last:
// asking on and on for empty pages cost a request at every scroll.
describe("nextResultsPage", () => {
  test("asks for the page after the one that came", () => {
    expect(nextResultsPage({ page: 1, totalPages: 3 })).toBe(2);
  });

  test("stops at the last page", () => {
    expect(nextResultsPage({ page: 3, totalPages: 3 })).toBeUndefined();
    expect(nextResultsPage({ page: 1, totalPages: 0 })).toBeUndefined();
  });

  test("stops without an answer", () => {
    expect(nextResultsPage(undefined)).toBeUndefined();
  });
});
