import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { SendCommand } from "@jellyfin/sdk/lib/generated-client";
import { SYNC_PLAY_TUNING } from "@/constants/SyncPlay";
import { makeApi } from "@/test-utils/jellyfinApi";
import { SyncPlayManager } from "../Manager";
import type { PlayerControls } from "../types";

const managers: SyncPlayManager[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
});
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fixture({ clockReady = true, attach = true } = {}) {
  const api = makeApi();
  api.mock.onGet(/\/Users\/Me$/).reply(200, { Id: "user-1" });
  api.mock
    .onGet(/\/Items\/movie-1\?/)
    .reply(200, { Id: "movie-1", Type: "Movie" });
  api.mock.onPost(/\/SyncPlay\//).reply(204);
  const manager = new SyncPlayManager(api);
  managers.push(manager);
  manager.init();
  manager.getTimeSync().stopPing();
  manager.processGroupUpdate({
    Type: "GroupJoined",
    Data: {
      GroupId: "group-1",
      State: "Paused",
      LastUpdatedAt: new Date(Date.now() - 2000).toISOString(),
    },
  });
  manager.getTimeSync().stopPing();
  await manager.getQueueCore().onPlayQueueUpdate(api, {
    Playlist: [{ ItemId: "movie-1", PlaylistItemId: "slot-1" }],
    PlayingItemIndex: 0,
    LastUpdate: new Date(Date.now() - 1000).toISOString(),
    StartPositionTicks: 100_000_000,
  });
  const native = {
    playing: false,
    buffering: false,
    positionMs: 10_000,
    autoEvents: true,
  };
  const trace: string[] = [];
  const stateEvent = (playing: boolean) => {
    native.playing = playing;
    manager.notifyPlaybackState(playing);
  };
  const loadingEvent = (buffering: boolean) => {
    native.buffering = buffering;
    manager.notifyBuffering(buffering);
  };
  const controls: PlayerControls = {
    itemId: "movie-1",
    play: mock(() => {
      trace.push("play");
      if (native.autoEvents) stateEvent(true);
    }),
    pause: mock(() => {
      trace.push("pause");
      if (native.autoEvents) stateEvent(false);
    }),
    stop: mock(() => {
      trace.push("stop");
    }),
    seekTo: mock((positionMs: number) => {
      trace.push(`seek:${positionMs}`);
      native.positionMs = positionMs;
      loadingEvent(true);
    }),
    setSpeed: mock((_speed: number) => {}),
    getSpeed: () => 1,
    getCurrentPosition: () => native.positionMs,
    isPlaying: () => native.playing,
    isBuffering: () => native.buffering,
  };
  if (attach) {
    manager.setPlayerControls(controls);
    manager.notifyPlaybackStart();
  }
  if (clockReady) manager.getTimeSync().emit("update", 0, 2);
  await settle();
  api.mock.resetHistory();

  let emittedAt = Date.now();
  const command = (
    Command: SendCommand["Command"],
    overrides: Partial<SendCommand> = {},
  ): SendCommand => ({
    Command,
    GroupId: "group-1",
    PlaylistItemId: "slot-1",
    PositionTicks: 100_000_000,
    When: new Date().toISOString(),
    EmittedAt: new Date(emittedAt++).toISOString(),
    ...overrides,
  });
  return {
    api,
    manager,
    controls,
    native,
    trace,
    stateEvent,
    loadingEvent,
    command,
  };
}

describe("SyncPlay upstream event ordering", () => {
  test("Pause waits for native confirmation, then seeks without an unpause", async () => {
    const f = await fixture();
    f.native.playing = true;
    f.native.autoEvents = false;
    f.manager.processCommand(
      f.command("Pause", { PositionTicks: 200_000_000 }),
    );
    await settle();
    expect(f.trace).toEqual(["pause"]);
    f.stateEvent(false);
    await settle();
    expect(f.trace).toEqual(["pause", "seek:20000"]);
    expect(f.api.mock.history.post).toHaveLength(0);
  });

  test("Seek unpauses, seeks, waits for ready, pauses, then acknowledges the landed position", async () => {
    const f = await fixture();
    f.manager.processCommand(f.command("Seek", { PositionTicks: 200_000_000 }));
    await settle();
    expect(f.trace).toEqual(["play", "seek:20000"]);
    expect(f.api.mock.history.post).toHaveLength(0);
    f.native.positionMs = 20_030;
    f.loadingEvent(false);
    await settle();
    expect(f.trace).toEqual(["play", "seek:20000", "pause"]);
    expect(f.api.mock.history.post).toHaveLength(1);
    expect(JSON.parse(f.api.mock.history.post[0].data)).toMatchObject({
      PlaylistItemId: "slot-1",
      PositionTicks: 200_300_000,
      IsPlaying: false,
    });
    expect(new URL(f.api.mock.history.post[0].url!).pathname).toBe(
      "/SyncPlay/Ready",
    );
  });

  test("a future Unpause does not seek an already aligned player", async () => {
    const f = await fixture();
    f.manager.processCommand(
      f.command("Unpause", {
        When: new Date(Date.now() + 60).toISOString(),
      }),
    );
    await settle();
    expect(f.trace).toEqual([]);
    await sleep(85);
    expect(f.trace).toEqual(["play"]);
  });

  test("server clock offset is applied once, not mixed with local schedule dates", async () => {
    const f = await fixture();
    const offset = spyOn(
      f.manager.getTimeSync(),
      "getTimeOffset",
    ).mockReturnValue(60_000);
    try {
      f.manager.processCommand(
        f.command("Unpause", {
          When: new Date(Date.now() + 60_060).toISOString(),
        }),
      );
      await settle();
      expect(f.trace).toEqual([]);
      await sleep(85);
      expect(f.trace).toEqual(["play"]);
    } finally {
      offset.mockRestore();
    }
  });

  test("an old Unpause catches up after native play confirms and duplicate delivery settles", async () => {
    const f = await fixture();
    const cmd = f.command("Unpause", {
      When: new Date(Date.now() - 1000).toISOString(),
    });
    f.manager.processCommand(cmd);
    await settle();
    expect(f.trace[0]).toBe("play");
    expect(f.controls.seekTo).toHaveBeenCalledTimes(1);
    f.loadingEvent(false);
    await settle();
    f.manager.processCommand(cmd);
    await settle();
    expect(f.controls.seekTo).toHaveBeenCalledTimes(1);
    expect(f.api.mock.history.post).toHaveLength(1);
  });

  test("duplicate Pause uses a deterministic landing tolerance instead of repeated or random seeks", async () => {
    const f = await fixture();
    const cmd = f.command("Pause");
    f.manager.processCommand(cmd);
    await settle();
    f.native.positionMs = 10_050;
    f.loadingEvent(false);
    await settle();
    f.manager.processCommand(cmd);
    await settle();
    expect(f.controls.seekTo).toHaveBeenCalledTimes(1);
  });

  test("new commands cancel an old seek's ready continuation", async () => {
    const f = await fixture();
    f.manager.processCommand(f.command("Seek", { PositionTicks: 200_000_000 }));
    await settle();
    f.manager.processCommand(
      f.command("Unpause", { PositionTicks: 200_000_000 }),
    );
    await settle();
    f.loadingEvent(false);
    await settle();
    expect(f.native.playing).toBe(true);
    expect(f.controls.pause).not.toHaveBeenCalled();
    expect(JSON.parse(f.api.mock.history.post[0].data).IsPlaying).toBe(true);
  });

  test("a new Unpause overrides a native pause still in flight despite the stale playing snapshot", async () => {
    const f = await fixture();
    f.native.playing = true;
    f.native.autoEvents = false;
    f.manager.processCommand(f.command("Pause"));
    await settle();
    expect(f.trace).toEqual(["pause"]);
    f.manager.processCommand(f.command("Unpause"));
    await settle();
    expect(f.trace).toEqual(["pause", "play"]);
    f.stateEvent(false);
    f.stateEvent(true);
    await settle();
    expect(f.native.playing).toBe(true);
    expect(f.controls.seekTo).not.toHaveBeenCalled();
  });

  test("native pause/unpause callbacks are events, never new group commands", async () => {
    const f = await fixture();
    f.stateEvent(true);
    f.stateEvent(false);
    await settle();
    expect(f.api.mock.history.post).toHaveLength(0);
  });

  test("readiness does not invent playback-start; queue startup sends its own Ready once", async () => {
    const f = await fixture({ attach: false });
    const started = mock(() => {});
    f.manager.on("playbackstart", started);
    f.manager.getQueueCore().scheduleReadyRequestOnPlaybackStart(f.api, "test");
    f.manager.setPlayerControls(f.controls);
    f.loadingEvent(false);
    await settle();
    expect(started).not.toHaveBeenCalled();
    expect(f.api.mock.history.post).toHaveLength(0);
    f.manager.notifyPlaybackStart();
    await settle();
    expect(started).toHaveBeenCalledTimes(1);
    expect(f.api.mock.history.post).toHaveLength(1);
    f.manager.notifyPlaybackStart();
    await settle();
    expect(started).toHaveBeenCalledTimes(1);
  });
});

describe("SyncPlay command ownership", () => {
  test("ping reports use whole milliseconds accepted by the server's Int64 DTO", async () => {
    const f = await fixture({ clockReady: false });
    f.api.mock.resetHandlers();
    f.api.mock.onPost(/\/SyncPlay\/Ping$/).reply((config) => {
      const { Ping } = JSON.parse(config.data);
      return [Number.isSafeInteger(Ping) && Ping >= 0 ? 204 : 400];
    });
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const ping of [12.5, 0.5, 0, -0.5, 12.25]) {
        f.manager.getTimeSync().emit("update", 0, ping);
        await settle();
      }
      expect(
        f.api.mock.history.post.map((request) => JSON.parse(request.data).Ping),
      ).toEqual([13, 1, 0, 0, 12]);
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  test("waits for server clock synchronization before applying a command", async () => {
    const f = await fixture({ clockReady: false });
    f.manager.processCommand(f.command("Unpause"));
    await settle();
    expect(f.trace).toEqual([]);
    f.manager.getTimeSync().emit("update", 0, 12);
    await settle();
    expect(f.trace).toEqual(["play"]);
    expect(new URL(f.api.mock.history.post[0].url!).pathname).toBe(
      "/SyncPlay/Ping",
    );
  });

  test("queued command survives late player attachment and is not applied to the wrong item", async () => {
    const f = await fixture({ attach: false });
    f.manager.processCommand(f.command("Unpause"));
    f.manager.setPlayerControls({ ...f.controls, itemId: "different-movie" });
    f.manager.notifyPlaybackStart();
    await settle();
    expect(f.trace).toEqual([]);
    f.manager.setPlayerControls(f.controls);
    f.manager.notifyPlaybackStart();
    await settle();
    expect(f.trace).toEqual(["play"]);
  });

  test("mismatched playlist slots and commands from an earlier group are ignored", async () => {
    const f = await fixture();
    f.manager.processCommand(f.command("Unpause", { GroupId: "old-group" }));
    f.manager.processCommand(
      f.command("Unpause", { PlaylistItemId: "old-slot" }),
    );
    await settle();
    expect(f.trace).toEqual([]);
    f.manager.processCommand(
      f.command("Unpause", { EmittedAt: new Date(0).toISOString() }),
    );
    await settle();
    expect(f.trace).toEqual([]);
  });

  test("a newer immediate Pause supersedes a future Unpause; When is not ordering", async () => {
    const f = await fixture();
    f.manager.processCommand(
      f.command("Unpause", {
        When: new Date(Date.now() + 60).toISOString(),
      }),
    );
    f.manager.processCommand(f.command("Pause"));
    await sleep(85);
    expect(f.controls.play).not.toHaveBeenCalled();
    expect(f.controls.seekTo).toHaveBeenCalledTimes(1);
  });

  test("detach cancels timers and ready callbacks belonging to the previous player", async () => {
    const f = await fixture();
    f.manager.processCommand(f.command("Seek", { PositionTicks: 200_000_000 }));
    await settle();
    f.manager.setPlayerControls(null);
    f.manager.notifyBuffering(false);
    await settle();
    expect(f.controls.pause).not.toHaveBeenCalled();
    expect(f.api.mock.history.post).toHaveLength(0);
  });

  test("Stop uses native teardown, not a pause impersonating stop", async () => {
    const f = await fixture();
    f.manager.processCommand(f.command("Stop"));
    await settle();
    expect(f.controls.stop).toHaveBeenCalledTimes(1);
    expect(f.controls.pause).not.toHaveBeenCalled();
  });

  test("Stop cancels queue startup without waiting for playbackstart", async () => {
    const f = await fixture();
    f.manager.getQueueCore().scheduleReadyRequestOnPlaybackStart(f.api, "test");
    f.manager.processCommand(f.command("Stop"));
    await settle();
    expect(f.controls.stop).toHaveBeenCalledTimes(1);
    f.manager.notifyPlaybackStart();
    await settle();
    expect(f.api.mock.history.post).toHaveLength(0);
  });
  test("Waiting state notifications never change local transport", async () => {
    const f = await fixture();
    f.manager.processGroupUpdate({
      Type: "StateUpdate",
      Data: { State: "Waiting", Reason: "Seek" },
    });
    expect(f.trace).toEqual([]);
  });

  test(
    "real native stalls still escalate after the upstream waiting threshold",
    async () => {
      const f = await fixture();
      f.loadingEvent(true);
      await sleep(SYNC_PLAY_TUNING.minBufferingThresholdMs + 30);
      expect(new URL(f.api.mock.history.post[0].url!).pathname).toBe(
        "/SyncPlay/Buffering",
      );
      f.loadingEvent(false);
      await settle();
      expect(new URL(f.api.mock.history.post[1].url!).pathname).toBe(
        "/SyncPlay/Ready",
      );
    },
    SYNC_PLAY_TUNING.minBufferingThresholdMs + 2000,
  );
});
