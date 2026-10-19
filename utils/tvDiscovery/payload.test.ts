import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { buildTVDiscoveryPayload, type TVDiscoveryItem } from "./payload";

const api = { basePath: "https://jellyfin.example" } as Api;

const tileFor = (item: BaseItemDto): TVDiscoveryItem => {
  const payload = buildTVDiscoveryPayload({
    api,
    sections: [{ title: "Continue and Next Up", items: [item] }],
  });
  const tile = payload?.sections[0]?.items[0];
  if (!tile) throw new Error("the item did not make it into the payload");
  return tile;
};

const PLAY = "streamyfin://topshelf/play";
const DETAILS = "streamyfin://topshelf/item";

describe("buildTVDiscoveryPayload: what Play does on a tile", () => {
  test("an episode plays straight from the tile", () => {
    const tile = tileFor({ Id: "ep-1", Name: "Pilot", Type: "Episode" });

    expect(tile.playRoute).toBe(`${PLAY}?id=ep-1`);
    expect(tile.route).toBe(`${DETAILS}?id=ep-1&type=Episode`);
  });

  test("a movie plays straight from the tile", () => {
    const tile = tileFor({ Id: "movie-1", Name: "Heat", Type: "Movie" });

    expect(tile.playRoute).toBe(`${PLAY}?id=movie-1`);
  });

  // Pins REACT-NATIVE-54: a Season tile handed its own id to the player, and
  // the server answers PlaybackInfo for a container with a 400.
  test("a season opens its series instead of being handed to the player", () => {
    const tile = tileFor({
      Id: "season-2",
      Name: "Season 2",
      Type: "Season",
      SeriesId: "series-1",
      IndexNumber: 2,
    });

    expect(tile.playRoute).not.toContain(PLAY);
    expect(tile.playRoute).toBe(tile.route);
    expect(tile.route).toBe(
      `${DETAILS}?id=season-2&type=Season&seriesId=series-1&seasonIndex=2`,
    );
  });

  test("a series opens its page instead of being handed to the player", () => {
    const tile = tileFor({ Id: "series-1", Name: "Severance", Type: "Series" });

    expect(tile.playRoute).toBe(`${DETAILS}?id=series-1&type=Series`);
    expect(tile.playRoute).toBe(tile.route);
  });

  test("specials keep their season index, which is 0", () => {
    const tile = tileFor({
      Id: "season-0",
      Name: "Specials",
      Type: "Season",
      SeriesId: "series-1",
      IndexNumber: 0,
    });

    expect(tile.route).toBe(
      `${DETAILS}?id=season-0&type=Season&seriesId=series-1&seasonIndex=0`,
    );
  });

  test("a season the server sent without its series still never plays", () => {
    const tile = tileFor({ Id: "season-2", Name: "Season 2", Type: "Season" });

    expect(tile.playRoute).toBe(`${DETAILS}?id=season-2&type=Season`);
  });

  test.each(["BoxSet", "Folder", "Playlist", "MusicAlbum"] as const)(
    "a %s opens its details too",
    (type) => {
      const tile = tileFor({
        Id: "container-1",
        Name: "Container",
        Type: type,
      });

      expect(tile.playRoute).toBe(tile.route);
    },
  );

  // isPlayableItem is a deny list: a kind this app has never heard of keeps
  // its Play action and the server decides.
  test("an item with no type keeps its play action", () => {
    const tile = tileFor({ Id: "unknown-1", Name: "Unknown" });

    expect(tile.playRoute).toBe(`${PLAY}?id=unknown-1`);
  });

  test("a container does not take the play action away from its neighbours", () => {
    const payload = buildTVDiscoveryPayload({
      api,
      sections: [
        {
          title: "Continue and Next Up",
          items: [
            { Id: "ep-1", Name: "Pilot", Type: "Episode" },
            { Id: "series-1", Name: "Severance", Type: "Series" },
            { Id: "movie-1", Name: "Heat", Type: "Movie" },
          ],
        },
      ],
    });

    expect(payload?.sections[0]?.items.map((tile) => tile.playRoute)).toEqual([
      `${PLAY}?id=ep-1`,
      `${DETAILS}?id=series-1&type=Series`,
      `${PLAY}?id=movie-1`,
    ]);
  });
});
