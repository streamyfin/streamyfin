import { afterEach, describe, expect, mock, test } from "bun:test";
import { makeApi } from "@/test-utils/jellyfinApi";
import { SyncPlayManager } from "../Manager";
import type { PlayerControls } from "../types";

const managers: SyncPlayManager[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
});
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fixture() {
  const api = makeApi();
  api.mock.onPost(/\/SyncPlay\//).reply(204);
  const manager = new SyncPlayManager(api);
  managers.push(manager);
  manager.init();
  manager.getTimeSync().stopPing();
  manager.processGroupUpdate({
    Type: "GroupJoined",
    Data: {
      GroupId: "group",
      State: "Paused",
      LastUpdatedAt: new Date(Date.now() - 2000).toISOString(),
    },
  });
  manager.getTimeSync().stopPing();
  return { api, manager, queue: manager.getQueueCore() };
}

describe("server queue to native presentation", () => {
  test("NewPlaylist immediately opens its selected item without fetching the whole queue", async () => {
    const { api, manager } = fixture();
    const presented = mock((itemId: string) => {
      const controls: PlayerControls = {
        itemId,
        play: () => {},
        pause: () => {},
        stop: () => {},
        seekTo: () => {},
        setSpeed: () => {},
        getSpeed: () => 1,
        isPlaying: () => false,
        isBuffering: () => false,
        getCurrentPosition: () => 5000,
      };
      manager.setPlayerControls(controls);
      manager.notifyPlaybackStart();
    });
    manager.getPlayerWrapper().setLocalPlayHandler((options) => {
      const itemId = options.ids[options.startIndex];
      if (!itemId) throw new Error("missing item");
      presented(itemId);
    });
    manager.processGroupUpdate({
      Type: "PlayQueue",
      Data: {
        Reason: "NewPlaylist",
        LastUpdate: new Date().toISOString(),
        PlayingItemIndex: 1,
        StartPositionTicks: 50_000_000,
        Playlist: [
          { ItemId: "first-episode", PlaylistItemId: "slot-1" },
          { ItemId: "selected-episode", PlaylistItemId: "slot-2" },
        ],
      },
    });
    await settle();
    expect(presented).toHaveBeenCalledWith("selected-episode");
    expect(api.mock.history.get).toHaveLength(0);
    expect(api.mock.history.post).toHaveLength(1);
    expect(JSON.parse(api.mock.history.post[0].data).PlaylistItemId).toBe(
      "slot-2",
    );
    expect(manager.isPreparingPlayback()).toBe(false);
  });

  test("received queues preserve repeated item IDs and selections beyond metadata fetch limits", () => {
    const { api, queue } = fixture();
    const playlist = Array.from({ length: 350 }, (_, index) => ({
      ItemId: "same-episode",
      PlaylistItemId: `slot-${index}`,
    }));
    queue.onPlayQueueUpdate(api, {
      LastUpdate: new Date().toISOString(),
      Playlist: playlist,
      PlayingItemIndex: 340,
    });
    expect(queue.getPlaylist()).toHaveLength(350);
    expect(queue.getCurrentPlaylistItemId()).toBe("slot-340");
    expect(queue.getCurrentItemId()).toBe("same-episode");
    expect(api.mock.history.get).toHaveLength(0);
  });

  test("invalid selected indexes fail before waiting for a player that cannot open", () => {
    const { api, queue } = fixture();
    expect(() =>
      queue.onPlayQueueUpdate(api, {
        LastUpdate: new Date().toISOString(),
        Playlist: [{ ItemId: "episode", PlaylistItemId: "slot" }],
        PlayingItemIndex: 9,
      }),
    ).toThrow("out of bounds");
  });

  test("missing player navigator rejects rather than pretending presentation succeeded", async () => {
    const { manager } = fixture();
    await expect(
      manager.getPlayerWrapper().localPlay({
        ids: ["episode"],
        startIndex: 0,
        startPositionTicks: 0,
      }),
    ).rejects.toThrow("navigator is not registered");
  });
});
