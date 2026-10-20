import { streamystatsAnswersSearch } from "./searchEngine";

describe("whether Streamystats answers the searches", () => {
  test("is what the search engine is set to", () => {
    expect(streamystatsAnswersSearch({ searchEngine: "Streamystats" })).toBe(
      true,
    );
    expect(streamystatsAnswersSearch({ searchEngine: "Marlin" })).toBe(false);
  });

  // An administrator can set Streamystats up for its other pages and keep
  // Jellyfin search: the address being known no longer picks the engine.
  test("is not that a Streamystats address is set", () => {
    expect(
      streamystatsAnswersSearch({
        searchEngine: "Jellyfin",
        streamyStatsServerUrl: "https://stats.example",
      } as never),
    ).toBe(false);
  });

  test("is no before the settings are read", () => {
    expect(streamystatsAnswersSearch(null)).toBe(false);
    expect(streamystatsAnswersSearch(undefined)).toBe(false);
  });
});
