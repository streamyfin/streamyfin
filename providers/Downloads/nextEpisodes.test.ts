import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  nextEpisodes,
  planNextEpisodes,
  withLocalPlayState,
} from "./nextEpisodes";
import type { NextEpisodesRule } from "./nextEpisodesRules";
import type { DownloadedItem } from "./types";

const episode = (
  id: string,
  {
    season = 1,
    played = false,
    lastPlayed,
    virtual = false,
  }: {
    season?: number;
    played?: boolean;
    lastPlayed?: string;
    virtual?: boolean;
  } = {},
): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: "Episode",
  SeriesId: "series-1",
  ParentIndexNumber: season,
  LocationType: virtual ? "Virtual" : "FileSystem",
  UserData: { Played: played, LastPlayedDate: lastPlayed },
});

const ids = (episodes: BaseItemDto[]) => episodes.map((e) => e.Id);

const rule = (change: Partial<NextEpisodesRule> = {}): NextEpisodesRule => ({
  seriesId: "series-1",
  seriesName: "Show",
  count: 3,
  deleteWatched: false,
  downloadedIds: [],
  ...change,
});

const plan = ({
  episodes,
  rule: r = rule(),
  downloaded = [],
  busy = [],
  playing = [],
  deleteAnyDownload = false,
}: {
  episodes: BaseItemDto[];
  rule?: NextEpisodesRule;
  downloaded?: string[];
  busy?: string[];
  playing?: string[];
  deleteAnyDownload?: boolean;
}) =>
  planNextEpisodes({
    episodes,
    rule: r,
    downloadedIds: new Set(downloaded),
    busyIds: new Set(busy),
    playingIds: new Set(playing),
    deleteAnyDownload,
  });

describe("nextEpisodes", () => {
  test("starts at the first episode of a series nobody has watched", () => {
    const episodes = ["e1", "e2", "e3", "e4"].map((id) => episode(id));
    expect(ids(nextEpisodes(episodes, 3))).toEqual(["e1", "e2", "e3"]);
  });

  test("starts after the last watched episode", () => {
    const episodes = [
      episode("e1", { played: true }),
      episode("e2", { played: true }),
      episode("e3"),
      episode("e4"),
    ];
    expect(ids(nextEpisodes(episodes, 3))).toEqual(["e3", "e4"]);
  });

  // An episode skipped early on is not what comes next.
  test("leaves out an unwatched episode before the last watched one", () => {
    const episodes = [
      episode("e1"),
      episode("e2", { played: true }),
      episode("e3"),
    ];
    expect(ids(nextEpisodes(episodes, 3))).toEqual(["e3"]);
  });

  test("runs on into the next season", () => {
    const episodes = [
      episode("s1e1", { played: true }),
      episode("s1e2"),
      episode("s2e1", { season: 2 }),
      episode("s2e2", { season: 2 }),
    ];
    expect(ids(nextEpisodes(episodes, 3))).toEqual(["s1e2", "s2e1", "s2e2"]);
  });

  test("leaves out specials and missing episodes", () => {
    const episodes = [
      episode("special", { season: 0 }),
      episode("e1"),
      episode("missing", { virtual: true }),
      episode("e2"),
    ];
    expect(ids(nextEpisodes(episodes, 3))).toEqual(["e1", "e2"]);
  });

  // A watched special sits outside the order and must not move the start.
  test("is not moved on by a watched special", () => {
    const episodes = [episode("e1"), episode("e2"), episode("special")];
    episodes[2] = episode("special", { season: 0, played: true });
    expect(ids(nextEpisodes(episodes, 3))).toEqual(["e1", "e2"]);
  });

  test("has nothing for a series watched to the end", () => {
    const episodes = [episode("e1", { played: true })];
    expect(nextEpisodes(episodes, 3)).toEqual([]);
  });
});

describe("withLocalPlayState", () => {
  const downloadOf = (item: BaseItemDto) =>
    ({ item }) as unknown as DownloadedItem;

  test("takes the watched state of a copy played offline since", () => {
    const remote = episode("e1", { lastPlayed: "2026-10-01T00:00:00Z" });
    const local = episode("e1", {
      played: true,
      lastPlayed: "2026-10-02T00:00:00Z",
    });
    const [merged] = withLocalPlayState([remote], [downloadOf(local)]);
    expect(merged.UserData?.Played).toBe(true);
  });

  test("keeps the server's state when it is the newer one", () => {
    const remote = episode("e1", { lastPlayed: "2026-10-03T00:00:00Z" });
    const local = episode("e1", {
      played: true,
      lastPlayed: "2026-10-02T00:00:00Z",
    });
    const [merged] = withLocalPlayState([remote], [downloadOf(local)]);
    expect(merged.UserData?.Played).toBe(false);
  });

  test("takes a copy played offline that the server never saw played", () => {
    const local = episode("e1", {
      played: true,
      lastPlayed: "2026-10-02T00:00:00Z",
    });
    const [merged] = withLocalPlayState([episode("e1")], [downloadOf(local)]);
    expect(merged.UserData?.Played).toBe(true);
  });

  test("leaves an episode without a downloaded copy alone", () => {
    const remote = episode("e1");
    expect(withLocalPlayState([remote], [])).toEqual([remote]);
  });
});

describe("planNextEpisodes", () => {
  const episodes = [
    episode("e1", { played: true }),
    episode("e2", { played: true }),
    episode("e3"),
    episode("e4"),
    episode("e5"),
    episode("e6"),
  ];

  test("downloads the next episodes that are not on the device yet", () => {
    const result = plan({ episodes, downloaded: ["e3"] });
    expect(ids(result.download)).toEqual(["e4", "e5"]);
  });

  test("does not start an episode that is already downloading", () => {
    const result = plan({ episodes, busy: ["e4"] });
    expect(ids(result.download)).toEqual(["e3", "e5"]);
  });

  test("keeps as many as the rule says", () => {
    const result = plan({ episodes, rule: rule({ count: 5 }) });
    expect(ids(result.download)).toEqual(["e3", "e4", "e5", "e6"]);
  });

  test("deletes nothing unless the rule deletes watched episodes", () => {
    const result = plan({
      episodes,
      rule: rule({ downloadedIds: ["e1"] }),
      downloaded: ["e1"],
    });
    expect(result.remove).toEqual([]);
  });

  test("deletes the watched episodes it downloaded", () => {
    const result = plan({
      episodes,
      rule: rule({ deleteWatched: true, downloadedIds: ["e1", "e2"] }),
      downloaded: ["e1", "e2", "e3"],
    });
    expect(result.remove).toEqual(["e1", "e2"]);
  });

  test("leaves a watched episode downloaded by hand", () => {
    const result = plan({
      episodes,
      rule: rule({ deleteWatched: true, downloadedIds: ["e2"] }),
      downloaded: ["e1", "e2"],
    });
    expect(result.remove).toEqual(["e2"]);
  });

  test("deletes a watched episode downloaded by hand when allowed to", () => {
    const result = plan({
      episodes,
      rule: rule({ deleteWatched: true, downloadedIds: ["e2"] }),
      downloaded: ["e1", "e2"],
      deleteAnyDownload: true,
    });
    expect(result.remove).toEqual(["e1", "e2"]);
  });

  test("never deletes an unwatched episode", () => {
    const result = plan({
      episodes,
      rule: rule({ deleteWatched: true, downloadedIds: ["e3"] }),
      downloaded: ["e3"],
      deleteAnyDownload: true,
    });
    expect(result.remove).toEqual([]);
  });

  test("never deletes the episode playing on the device", () => {
    const result = plan({
      episodes,
      rule: rule({ deleteWatched: true, downloadedIds: ["e1", "e2"] }),
      downloaded: ["e1", "e2"],
      playing: ["e2"],
    });
    expect(result.remove).toEqual(["e1"]);
  });

  test("has nothing to delete for an episode no longer on the device", () => {
    const result = plan({
      episodes,
      rule: rule({ deleteWatched: true, downloadedIds: ["e1"] }),
    });
    expect(result.remove).toEqual([]);
  });
});
