import { isSeerrQuery, touchedByRequest } from "./queries";

// What a reset of Seerr takes out of the query cache, which is kept on the
// device for a day: every answer from the Seerr left, so that the next one
// does not show its quota, seasons or settings until they are asked again.
describe("isSeerrQuery", () => {
  test("takes every Seerr query, search results included", () => {
    expect(isSeerrQuery(["seerr", "quota", 1])).toBe(true);
    expect(isSeerrQuery(["seerr", "settings", "public", "https://a"])).toBe(
      true,
    );
    expect(isSeerrQuery(["search", "seerr", "results", "dune"])).toBe(true);
  });

  test("leaves Jellyfin's queries alone", () => {
    expect(isSeerrQuery(["jellyfin", "quickConnectEnabled", "https://a"])).toBe(
      false,
    );
    expect(isSeerrQuery(["item", "seerr-like-id"])).toBe(false);
  });
});

// What a request, an approval or a decline leaves out of date, so that
// Discover and the title's page show it when the user comes back to them.
describe("touchedByRequest", () => {
  const touched = touchedByRequest({ mediaType: "tv", mediaId: 1399 });

  test("takes the recent requests and each request card", () => {
    expect(touched(["seerr", "recent_requests"])).toBe(true);
    expect(touched(["seerr", "requests", "tv", 42])).toBe(true);
  });

  test("takes the Seerr search results, whose status icons move", () => {
    expect(touched(["search", "seerr", "results", "dune"])).toBe(true);
  });

  // Seerr's own Discover asks for its rows again each time it opens.
  test("takes Discover's rows, whose posters show a title's status", () => {
    expect(touched(["seerr", "discover", 3])).toBe(true);
  });

  // The posters of a genre, a studio or a network, and of a person's roles,
  // show a title's status as Discover's do.
  test("takes the other pages of posters", () => {
    expect(touched(["seerr", "genre", "movie", 28])).toBe(true);
    expect(touched(["seerr", "company", "tv", 213])).toBe(true);
    expect(touched(["seerr", "person", "17419"])).toBe(true);
  });

  // A request spends the quota and a decline gives it back. A refusal can
  // mean the sheet's quota was out of date: it stays open, to be read again.
  test("takes the quota", () => {
    expect(touched(["seerr", "quota", 7])).toBe(true);
  });

  test("takes the title asked for, and no other", () => {
    expect(touched(["seerr", "detail", "tv", 1399])).toBe(true);
    expect(touched(["seerr", "detail", "tv", 1400])).toBe(false);
    expect(touched(["seerr", "detail", "movie", 1399])).toBe(false);
  });

  test("leaves the rest alone", () => {
    expect(touched(["seerr", "recently_added"])).toBe(false);
    expect(touched(["seerr", "settings", "public", "https://a"])).toBe(false);
    expect(touched(["seerr", "users"])).toBe(false);
    expect(touched(["seerr", "request", "tv", "service"])).toBe(false);
    expect(touched(["search", "movies", "dune"])).toBe(false);
  });

  test("takes no title without one", () => {
    expect(touchedByRequest()(["seerr", "detail", "tv", 1399])).toBe(false);
    expect(touchedByRequest()(["seerr", "recent_requests"])).toBe(true);
  });
});
