import { makeApi } from "@/test-utils/jellyfinApi";
import { fetchOfficialRatings, withSelectedRatings } from "./officialRatings";

describe("the ratings a library can be filtered by", () => {
  // Without the item type the server also reports ratings that only seasons
  // or episodes carry, and on 10.11 picking one empties a Shows library.
  test("are asked for the kind of item the grid lists", async () => {
    const api = makeApi({ OfficialRatings: ["TV-14", "TV-MA"] });

    const ratings = await fetchOfficialRatings(api, {
      userId: "user-1",
      parentId: "library-1",
      includeItemTypes: ["Series"],
    });

    const url = new URL(api.mock.history.get[0].url ?? "");
    expect(url.pathname).toBe("/Items/Filters");
    expect(url.searchParams.get("parentId")).toBe("library-1");
    expect(url.searchParams.get("userId")).toBe("user-1");
    expect(url.searchParams.getAll("includeItemTypes")).toEqual(["Series"]);
    expect(ratings).toEqual(["TV-14", "TV-MA"]);
  });

  test("are every kind's in a library that lists every kind", async () => {
    const api = makeApi({ OfficialRatings: ["PG"] });

    await fetchOfficialRatings(api, {
      userId: "user-1",
      parentId: "library-1",
      includeItemTypes: undefined,
    });

    const url = new URL(api.mock.history.get[0].url ?? "");
    expect(url.searchParams.has("includeItemTypes")).toBe(false);
  });

  test("are none when the server reports none", async () => {
    const api = makeApi({});

    await expect(
      fetchOfficialRatings(api, {
        userId: "user-1",
        parentId: "library-1",
        includeItemTypes: ["Movie"],
      }),
    ).resolves.toEqual([]);
  });
});

describe("the rating choices", () => {
  // A saved pick the server stopped listing (a title re-rated or deleted, or
  // on Jellyfin 12 a rating the account's parental limit hides) still filters
  // the grid, so it has to stay on screen to be taken back.
  test("keep a saved rating the library no longer reports", () => {
    expect(withSelectedRatings(["PG", "PG-13"], ["R", "PG"])).toEqual([
      "PG",
      "PG-13",
      "R",
    ]);
  });

  test("are the library's own when every pick is listed", () => {
    const options = ["PG", "PG-13"];

    expect(withSelectedRatings(options, ["PG"])).toBe(options);
    expect(withSelectedRatings([], ["R"])).toEqual(["R"]);
  });
});
