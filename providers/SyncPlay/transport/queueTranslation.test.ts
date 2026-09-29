import { describe, expect, test } from "bun:test";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client";
import { makeApi } from "@/test-utils/jellyfinApi";
import { SyncPlayManager } from "../Manager";
import {
  getItemsForPlayback,
  translateItemsForPlayback,
} from "./queueTranslation";

const user: UserDto = {
  Id: "user-1",
  Configuration: { EnableNextEpisodeAutoPlay: true },
};

describe("SDK queue requests reuse authenticated user data", () => {
  test("starting an item uses SDK requests without fetching the current user again", async () => {
    const api = makeApi();
    api.mock
      .onGet(/\/Items\/movie-1\?/)
      .reply(200, { Id: "movie-1", Type: "Movie" });
    api.mock.onPost(/\/SyncPlay\/SetNewQueue$/).reply(204);
    const manager = new SyncPlayManager(api, () => user);
    manager.init();
    manager.getTimeSync().stopPing();
    try {
      await manager
        .getController()
        .play({ ids: ["movie-1"], startPositionTicks: 12345 });
      expect(api.mock.history.get).toHaveLength(1);
      expect(api.mock.history.get[0].url).toContain("userId=user-1");
      expect(JSON.parse(api.mock.history.post[0].data)).toEqual({
        PlayingQueue: ["movie-1"],
        PlayingItemPosition: 0,
        StartPositionTicks: 12345,
      });
    } finally {
      manager.destroy();
    }
  });

  test("SDK query options preserve folder filtering and outgoing item order", async () => {
    const api = makeApi();
    api.mock
      .onGet(/\/Items\?/)
      .reply(200, { Items: [{ Id: "b" }, { Id: "a" }] });
    const fetched = await getItemsForPlayback(api, user, ["a", "b"]);
    const ordered = await translateItemsForPlayback(api, user, fetched, {
      ids: ["a", "b"],
    });
    expect(ordered.map((item) => item.Id)).toEqual(["a", "b"]);
    await translateItemsForPlayback(api, user, [
      { Id: "series", Type: "Series", IsFolder: true },
    ]);
    const query = new URL(api.mock.history.get[1].url!).searchParams;
    expect(query.get("userId")).toBe("user-1");
    expect(query.get("parentId")).toBe("series");
    expect(query.get("filters")).toBe("IsNotFolder");
    expect(query.get("recursive")).toBe("true");
    expect(query.get("excludeLocationTypes")).toBe("Virtual");
  });

  test("autoplay uses the existing user preference and returns the remaining episodes", async () => {
    const api = makeApi();
    api.mock.onGet(/\/Shows\/series\/Episodes\?/).reply(200, {
      Items: [{ Id: "earlier" }, { Id: "current" }, { Id: "next" }],
    });
    const item = {
      Id: "current",
      Type: "Episode" as const,
      SeriesId: "series",
    };
    expect(
      (await translateItemsForPlayback(api, user, [item])).map(
        (episode) => episode.Id,
      ),
    ).toEqual(["current", "next"]);
    api.mock.resetHistory();
    expect(
      await translateItemsForPlayback(
        api,
        {
          ...user,
          Configuration: { EnableNextEpisodeAutoPlay: false },
        },
        [item],
      ),
    ).toEqual([item]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  test("a live program resolves its channel and a playlist uses the SDK parent query", async () => {
    const api = makeApi();
    api.mock
      .onGet(/\/Items\/channel\?/)
      .reply(200, { Id: "channel", Type: "TvChannel" });
    api.mock
      .onGet(/\/Items\?/)
      .reply(200, { Items: [{ Id: "playlist-item" }] });
    expect(
      await translateItemsForPlayback(api, user, [
        {
          Id: "program",
          Type: "Program",
          ChannelId: "channel",
        },
      ]),
    ).toEqual([{ Id: "channel", Type: "TvChannel" }]);
    expect(
      await translateItemsForPlayback(
        api,
        user,
        [
          {
            Id: "playlist",
            Type: "Playlist",
          },
        ],
        { shuffle: true },
      ),
    ).toEqual([{ Id: "playlist-item" }]);
    const query = new URL(api.mock.history.get[1].url!).searchParams;
    expect(query.get("parentId")).toBe("playlist");
    expect(query.get("sortBy")).toBe("Random");
  });
});
