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
  test("clearing the selected item releases manager preparation as well as its waiter", () => {
    const { api, manager, queue } = fixture();
    queue.scheduleReadyRequestOnPlaybackStart(api, "test");
    expect(manager.isPreparingPlayback()).toBe(true);
    queue.setCurrentPlaylistItem(api, null);
    expect(manager.isPreparingPlayback()).toBe(false);
  });

  test("playback uses the handler that accepted the request, even if registration changes", async () => {
    const { manager } = fixture();
    const handler = mock(() => {});
    const player = manager.getPlayerWrapper();
    player.setLocalPlayHandler(handler);
    const options = { ids: ["episode"], startIndex: 0, startPositionTicks: 0 };
    const started = player.localPlay(options);
    player.setLocalPlayHandler(null);
    await started;
    expect(handler).toHaveBeenCalledWith(options);
  });

  test("a failed navigation reports one startup error rather than duplicate toasts", async () => {
    const { api, manager, queue } = fixture();
    queue.onPlayQueueUpdate({
      LastUpdate: new Date().toISOString(),
      PlayingItemIndex: 0,
      Playlist: [{ ItemId: "episode", PlaylistItemId: "slot" }],
    });
    const toast = mock(() => {});
    manager.on("toast", toast);
    manager
      .getPlayerWrapper()
      .setLocalPlayHandler(() =>
        Promise.reject(new Error("presentation failed")),
      );
    queue.startPlayback(api);
    await settle();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("MessageSyncPlayErrorMedia");
  });

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
    queue.onPlayQueueUpdate({
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
    const { queue } = fixture();
    expect(() =>
      queue.onPlayQueueUpdate({
        LastUpdate: new Date().toISOString(),
        Playlist: [{ ItemId: "episode", PlaylistItemId: "slot" }],
        PlayingItemIndex: 9,
      }),
    ).toThrow("out of bounds");
  });

  test("stores the SDK queue shape without mapping ItemId into another DTO", () => {
    const { queue } = fixture();
    const entry = { ItemId: "episode", PlaylistItemId: "slot" };
    queue.onPlayQueueUpdate({
      LastUpdate: new Date().toISOString(),
      Playlist: [entry],
      PlayingItemIndex: 0,
    });
    expect(queue.getPlaylist()).toEqual([entry]);
    expect(queue.getPlaylist()[0]).not.toHaveProperty("Id");
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
