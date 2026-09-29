import { describe, expect, test } from "bun:test";
import { isSeerrQuery } from "./queries";

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
