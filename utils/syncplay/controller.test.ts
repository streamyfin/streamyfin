import { SyncPlayController } from "./controller";
import type {
  SyncPlayCommand,
  SyncPlayGroup,
  SyncPlayPlayerAdapter,
  SyncPlayPlayerState,
  SyncPlayQueue,
  SyncPlayTransport,
} from "./types";

const epoch = Date.parse("2026-10-05T12:00:00Z");
const iso = (offset = 0) => new Date(Date.now() + offset).toISOString();
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const group: SyncPlayGroup = {
  GroupId: "group-1",
  GroupName: "Watch party",
  Participants: ["Alice"],
  State: "Idle",
  LastUpdatedAt: new Date(epoch).toISOString(),
};

describe("SyncPlay server-coordinated playback", () => {
  let transport: jest.Mocked<SyncPlayTransport>;
  let controller: SyncPlayController;
  let state: SyncPlayPlayerState;
  let player: jest.Mocked<SyncPlayPlayerAdapter>;
  let launch: jest.Mock;
  let unregisterPlayer: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(epoch);
    transport = {
      listGroups: jest.fn().mockResolvedValue([group]),
      getGroup: jest.fn().mockResolvedValue(group),
      createGroup: jest.fn().mockResolvedValue(undefined),
      joinGroup: jest.fn().mockResolvedValue(undefined),
      leaveGroup: jest.fn().mockResolvedValue(undefined),
      getTime: jest.fn().mockImplementation(async () => ({
        RequestReceptionTime: iso(),
        ResponseTransmissionTime: iso(),
      })),
      ping: jest.fn().mockResolvedValue(undefined),
      playItems: jest.fn().mockResolvedValue(undefined),
      queueItems: jest.fn().mockResolvedValue(undefined),
      removePlaylistItems: jest.fn().mockResolvedValue(undefined),
      movePlaylistItem: jest.fn().mockResolvedValue(undefined),
      setPlaylistItem: jest.fn().mockResolvedValue(undefined),
      setRepeatMode: jest.fn().mockResolvedValue(undefined),
      setShuffleMode: jest.fn().mockResolvedValue(undefined),
      setIgnoreWait: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn().mockResolvedValue(undefined),
      unpause: jest.fn().mockResolvedValue(undefined),
      seek: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      next: jest.fn().mockResolvedValue(undefined),
      previous: jest.fn().mockResolvedValue(undefined),
      ready: jest.fn().mockResolvedValue(undefined),
      buffering: jest.fn().mockResolvedValue(undefined),
    };
    state = {
      itemId: null,
      positionTicks: 0,
      isReady: false,
      isBuffering: false,
      isPlaying: false,
    };
    player = {
      getState: jest.fn(() => state),
      pause: jest.fn(() => {
        state.isPlaying = false;
      }),
      resume: jest.fn(() => {
        state.isPlaying = true;
      }),
      seek: jest.fn((position) => {
        state.positionTicks = position;
      }),
      stop: jest.fn(() => {
        state.itemId = null;
        state.isPlaying = false;
      }),
    };
    launch = jest.fn(async (request) => {
      state.itemId = request.itemId;
      state.positionTicks = request.startPositionTicks;
      state.isReady = false;
    });
    controller = new SyncPlayController(transport, jest.fn());
    controller.setConnected(true);
    unregisterPlayer = controller.registerPlayer(player);
    controller.registerLauncher(launch);
  });

  afterEach(() => {
    controller.dispose();
    jest.useRealTimers();
  });

  const join = async () => {
    await controller.joinGroup(group.GroupId);
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "GroupJoined",
      Data: group,
    });
    await settle();
  };
  const queue = (
    position = 0,
    itemId = "movie-1",
    playlistItemId = "playlist-1",
  ) =>
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "PlayQueue",
      Data: {
        LastUpdate: iso(),
        Playlist: [{ ItemId: itemId, PlaylistItemId: playlistItemId }],
        PlayingItemIndex: 0,
        StartPositionTicks: position,
        Reason: "NewPlaylist",
      },
    });
  const ready = async () => {
    state.isReady = true;
    controller.notifyReady();
    await settle();
  };
  const command = (
    kind: SyncPlayCommand["Command"],
    offset = 0,
    positionTicks = 0,
    overrides: Partial<SyncPlayCommand> = {},
  ) =>
    controller.handleCommand({
      GroupId: group.GroupId,
      PlaylistItemId: "playlist-1",
      Command: kind,
      When: iso(offset),
      EmittedAt: iso(),
      PositionTicks: positionTicks,
      ...overrides,
    });
  const tick = async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await settle();
  };
  const playlist = (update: Partial<SyncPlayQueue> = {}) =>
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "PlayQueue",
      Data: {
        LastUpdate: iso(),
        Playlist: [
          { ItemId: "movie-1", PlaylistItemId: "playlist-1" },
          { ItemId: "movie-2", PlaylistItemId: "playlist-2" },
          { ItemId: "movie-1", PlaylistItemId: "playlist-3" },
        ],
        PlayingItemIndex: 0,
        StartPositionTicks: 0,
        Reason: "NewPlaylist",
        RepeatMode: "RepeatNone",
        ShuffleMode: "Sorted",
        ...update,
      },
    });

  test("gets one group and refreshes info without joining or overwriting newer websocket membership", async () => {
    expect(await controller.getGroup(group.GroupId)).toEqual(group);
    expect(transport.getGroup).toHaveBeenCalledWith(group.GroupId);
    expect(controller.getSnapshot().group).toBeNull();
    await join();
    transport.getGroup.mockResolvedValue({ ...group, State: "Playing" });
    await controller.getGroup(group.GroupId);
    expect(controller.getSnapshot().groupState).toBe("Playing");
    let complete!: (value: SyncPlayGroup) => void;
    transport.getGroup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = controller.getGroup(group.GroupId);
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "UserJoined",
      Data: "Bob",
    });
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "StateUpdate",
      Data: { State: "Paused" },
    });
    complete({ ...group, State: "Idle" });
    await pending;
    expect(controller.getSnapshot()).toMatchObject({
      groupState: "Paused",
      group: { Participants: ["Alice", "Bob"] },
    });
    expect(transport.joinGroup).toHaveBeenCalledTimes(1);
  });

  test("all queue mutations send playlist ids and remain server authoritative", async () => {
    await join();
    playlist();
    await ready();
    const original = controller.getSnapshot().playlist;
    await controller.queueItems(["movie-3"]);
    await controller.queueItems(["movie-4", "movie-5"], "QueueNext");
    await controller.removePlaylistItems(["playlist-3"]);
    await controller.movePlaylistItem("playlist-2", 0);
    await controller.requestPlaylistItem("playlist-3");
    await controller.clearPlaylist();
    await controller.clearPlaylist(true);
    await controller.setRepeatMode("RepeatOne");
    await controller.setShuffleMode("Shuffle");
    expect(transport.queueItems.mock.calls).toEqual([
      [["movie-3"], "Queue"],
      [["movie-4", "movie-5"], "QueueNext"],
    ]);
    expect(transport.removePlaylistItems.mock.calls).toEqual([
      [["playlist-3"], false, false],
      [[], true, false],
      [[], true, true],
    ]);
    expect(transport.movePlaylistItem).toHaveBeenCalledWith("playlist-2", 0);
    expect(transport.setPlaylistItem).toHaveBeenCalledWith("playlist-3");
    expect(transport.setRepeatMode).toHaveBeenCalledWith("RepeatOne");
    expect(transport.setShuffleMode).toHaveBeenCalledWith("Shuffle");
    expect(controller.getSnapshot()).toMatchObject({
      playlist: original,
      currentPlaylistItemId: "playlist-1",
      repeatMode: "RepeatNone",
      shuffleMode: "Sorted",
    });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
  });

  test("invalid media ids, playlist ids, indices and modes do not reach the server", async () => {
    await join();
    playlist();
    await expect(controller.queueItems([])).rejects.toThrow();
    await expect(controller.queueItems([""])).rejects.toThrow();
    await expect(controller.removePlaylistItems(["movie-1"])).rejects.toThrow();
    await expect(controller.requestPlaylistItem("movie-1")).rejects.toThrow();
    await expect(
      controller.movePlaylistItem("playlist-1", 1.5),
    ).rejects.toThrow();
    await expect(
      controller.movePlaylistItem("playlist-1", 3),
    ).rejects.toThrow();
    await expect(
      controller.setRepeatMode("invalid" as "RepeatOne"),
    ).rejects.toThrow();
    await expect(
      controller.setShuffleMode("invalid" as "Shuffle"),
    ).rejects.toThrow();
    expect(transport.queueItems).not.toHaveBeenCalled();
    expect(transport.removePlaylistItems).not.toHaveBeenCalled();
    expect(transport.setPlaylistItem).not.toHaveBeenCalled();
    expect(transport.movePlaylistItem).not.toHaveBeenCalled();
    expect(transport.setRepeatMode).not.toHaveBeenCalled();
    expect(transport.setShuffleMode).not.toHaveBeenCalled();
  });

  test.each([
    "Queue",
    "QueueNext",
    "MoveItem",
    "RemoveItems",
    "RepeatMode",
    "ShuffleMode",
  ])(
    "%s update preserves the current decoder and scheduled Unpause",
    async (reason) => {
      await join();
      playlist();
      await ready();
      command("Unpause", 1000);
      await tick(100);
      const previous = controller.getSnapshot().playlist;
      playlist({
        Reason: reason,
        Playlist: [previous[1], previous[0]],
        PlayingItemIndex: 1,
        StartPositionTicks: 0,
        RepeatMode: "RepeatAll",
        ShuffleMode: "Shuffle",
      });
      expect(controller.getSnapshot()).toMatchObject({
        playingItemIndex: 1,
        currentPlaylistItemId: "playlist-1",
        repeatMode: "RepeatAll",
        shuffleMode: "Shuffle",
        hasNext: true,
        hasPrevious: true,
      });
      await tick(900);
      expect(player.resume).toHaveBeenCalledTimes(1);
      expect(player.pause).not.toHaveBeenCalled();
      expect(launch).toHaveBeenCalledTimes(1);
      expect(transport.ready).toHaveBeenCalledTimes(1);
    },
  );

  test("a delayed command remains valid after a newer metadata-only queue edit", async () => {
    await join();
    playlist();
    await ready();
    const emitted = iso();
    await tick(100);
    playlist({ Reason: "RepeatMode", RepeatMode: "RepeatAll" });
    command("Unpause", 0, 0, { EmittedAt: emitted });
    await tick(0);
    expect(player.resume).toHaveBeenCalledTimes(1);
  });

  test("removing the playing entry loads the server's replacement and reports its id", async () => {
    await join();
    playlist();
    await ready();
    await tick(1);
    playlist({
      Reason: "RemoveItems",
      Playlist: [{ ItemId: "movie-2", PlaylistItemId: "playlist-2" }],
      PlayingItemIndex: 0,
    });
    await settle();
    expect(launch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        itemId: "movie-2",
        playlistItemId: "playlist-2",
        startPositionTicks: 0,
      }),
    );
    await ready();
    expect(transport.ready).toHaveBeenLastCalledWith(
      expect.objectContaining({ PlaylistItemId: "playlist-2" }),
    );
    expect(transport.setPlaylistItem).not.toHaveBeenCalled();
  });

  test("empty queue closes the decoder without Stop and retains membership", async () => {
    await join();
    playlist();
    await ready();
    command("Unpause", 1000);
    await tick(10);
    playlist({ Reason: "RemoveItems", Playlist: [], PlayingItemIndex: -1 });
    await settle();
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      group: { GroupId: group.GroupId, State: "Idle" },
      groupState: "Idle",
      playlist: [],
      playingItemIndex: -1,
      currentPlaylistItemId: null,
      hasNext: false,
      hasPrevious: false,
    });
    command("Stop");
    await tick(1000);
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(player.resume).not.toHaveBeenCalled();
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("appending to an idle group publishes the queue without choosing an item locally", async () => {
    await join();
    playlist({ Reason: "Queue", PlayingItemIndex: -1 });
    await settle();
    expect(controller.getSnapshot()).toMatchObject({
      playingItemIndex: -1,
      currentPlaylistItemId: null,
      hasNext: false,
      hasPrevious: false,
    });
    expect(controller.getSnapshot().playlist).toHaveLength(3);
    expect(launch).not.toHaveBeenCalled();
    await controller.requestPlaylistItem("playlist-2");
    expect(transport.setPlaylistItem).toHaveBeenCalledWith("playlist-2");
  });

  test.each(["RepeatNone", "RepeatOne", "RepeatAll"] as const)(
    "%s navigation matches server wrap/restart semantics",
    async (repeatMode) => {
      await join();
      playlist({ RepeatMode: repeatMode });
      expect(controller.getSnapshot()).toMatchObject({
        hasPrevious: repeatMode !== "RepeatNone",
        hasNext: true,
      });
      await tick(1);
      playlist({
        RepeatMode: repeatMode,
        PlayingItemIndex: 2,
        Reason: "SetCurrentItem",
      });
      expect(controller.getSnapshot()).toMatchObject({
        hasNext: repeatMode !== "RepeatNone",
        hasPrevious: true,
      });
      await tick(1);
      playlist({
        RepeatMode: repeatMode,
        Playlist: [{ ItemId: "movie-1", PlaylistItemId: "only" }],
        PlayingItemIndex: 0,
      });
      expect(controller.getSnapshot()).toMatchObject({
        hasNext: repeatMode !== "RepeatNone",
        hasPrevious: repeatMode !== "RepeatNone",
      });
    },
  );

  test("ignore-wait requests are ordered and acknowledged state resets on leave", async () => {
    await join();
    let complete!: () => void;
    transport.setIgnoreWait.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const ignore = controller.setIgnoreWait(true);
    const follow = controller.setIgnoreWait(false);
    await settle();
    expect(controller.getSnapshot().ignoreWait).toBe(false);
    expect(transport.setIgnoreWait.mock.calls).toEqual([[true]]);
    complete();
    await ignore;
    await follow;
    expect(transport.setIgnoreWait.mock.calls).toEqual([[true], [false]]);
    expect(controller.getSnapshot().ignoreWait).toBe(false);
    await controller.setIgnoreWait(true);
    expect(controller.getSnapshot().ignoreWait).toBe(true);
    await controller.leaveGroup();
    expect(controller.getSnapshot().ignoreWait).toBe(false);
  });

  test("failed actions release later requests and departed memberships discard queued work", async () => {
    await join();
    transport.setRepeatMode.mockRejectedValueOnce(new Error("denied"));
    const failure = controller.setRepeatMode("RepeatOne");
    const success = controller.setShuffleMode("Shuffle");
    await expect(failure).rejects.toThrow("denied");
    await success;
    expect(transport.setShuffleMode).toHaveBeenCalledWith("Shuffle");
    let complete!: () => void;
    transport.setIgnoreWait.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = controller.setIgnoreWait(true);
    const stale = controller.queueItems(["old-movie"]);
    await settle();
    await controller.leaveGroup();
    await join();
    await controller.queueItems(["new-movie"]);
    expect(controller.getSnapshot().busy).toBe(false);
    let completeActive!: () => void;
    transport.pause.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeActive = resolve;
        }),
    );
    const active = controller.requestPause();
    await settle();
    complete();
    await pending;
    await stale;
    expect(controller.getSnapshot().busy).toBe(true);
    completeActive();
    await active;
    expect(controller.getSnapshot().busy).toBe(false);
    expect(controller.getSnapshot().ignoreWait).toBe(false);
    expect(transport.queueItems.mock.calls).toEqual([[["new-movie"], "Queue"]]);
  });

  test("lists groups and creates with websocket confirmation on older servers", async () => {
    await controller.refreshGroups();
    expect(controller.getSnapshot().groups).toEqual([group]);
    await controller.createGroup("  Watch party  ");
    expect(transport.createGroup).toHaveBeenCalledWith("Watch party");
    expect(controller.getSnapshot().group).toBeNull();
    controller.handleGroupUpdate({
      Type: "GroupJoined",
      GroupId: group.GroupId,
      Data: group,
    });
    await settle();
    expect(controller.getSnapshot().group).toEqual(group);
    expect(transport.ping).toHaveBeenCalledWith(0);
  });

  test("accepts create HTTP group response on newer servers", async () => {
    transport.createGroup.mockResolvedValue(group);
    await controller.createGroup(group.GroupName);
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
  });

  test("rejects empty or oversized names before talking to server", async () => {
    await expect(controller.createGroup(" ")).rejects.toThrow();
    await expect(controller.createGroup("x".repeat(65))).rejects.toThrow();
    expect(transport.createGroup).not.toHaveBeenCalled();
    expect(controller.getSnapshot().error).toBe("invalid_name");
  });

  test("only expected join confirmation enables playback", async () => {
    controller.handleGroupUpdate({ Type: "GroupJoined", Data: group });
    expect(controller.getSnapshot().group).toBeNull();
    await controller.joinGroup(group.GroupId);
    controller.handleGroupUpdate({
      Type: "GroupJoined",
      GroupId: "other",
      Data: { ...group, GroupId: "other" },
    });
    expect(controller.getSnapshot().group).toBeNull();
    controller.handleGroupUpdate({
      Type: "GroupJoined",
      GroupId: group.GroupId,
      Data: group,
    });
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
  });

  test("loads queue paused then sends one Ready with playlist id and server time", async () => {
    await join();
    queue(100_000_000);
    await settle();
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "movie-1",
        playlistItemId: "playlist-1",
        startPositionTicks: 100_000_000,
      }),
    );
    expect(transport.ready).not.toHaveBeenCalled();
    await ready();
    controller.notifyReady();
    expect(transport.ready).toHaveBeenCalledTimes(1);
    expect(transport.ready).toHaveBeenCalledWith({
      When: iso(),
      PositionTicks: 100_000_000,
      IsPlaying: false,
      PlaylistItemId: "playlist-1",
    });
  });

  test("player controls request group changes; server commands never echo requests", async () => {
    await join();
    queue();
    await ready();
    await controller.playItems(["movie-1", "movie-2"], 1, 30_000_000);
    await controller.requestPause();
    await controller.requestUnpause();
    await controller.requestSeek(40_000_000);
    await controller.requestStop();
    expect(transport.playItems).toHaveBeenCalledWith(
      ["movie-1", "movie-2"],
      1,
      30_000_000,
    );
    expect(player.pause).not.toHaveBeenCalled();
    command("Pause", 0, 50_000_000);
    await tick(0);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenLastCalledWith(50_000_000);
    expect(transport.pause).toHaveBeenCalledTimes(1);
    expect(transport.seek).toHaveBeenCalledTimes(1);
  });

  test("schedules future Unpause and catches up if a command arrives late", async () => {
    await join();
    queue();
    await ready();
    command("Unpause", 500, 100_000_000);
    await tick(499);
    expect(player.resume).not.toHaveBeenCalled();
    await tick(1);
    expect(player.resume).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenLastCalledWith(100_000_000);
    command("Unpause", -2000, 200_000_000);
    await tick(0);
    expect(player.seek).toHaveBeenLastCalledWith(220_000_000);
    expect(transport.unpause).not.toHaveBeenCalled();
  });

  test("new server command cancels earlier scheduled playback", async () => {
    await join();
    queue();
    await ready();
    command("Unpause", 1000, 20_000_000);
    await tick(20);
    command("Pause", 100, 25_000_000);
    await tick(1100);
    expect(player.resume).not.toHaveBeenCalled();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(state.positionTicks).toBe(25_000_000);
  });

  test("drops commands before group join and for another group or playlist", async () => {
    await join();
    queue();
    await ready();
    command("Pause", 0, 10, { EmittedAt: new Date(epoch - 1).toISOString() });
    command("Pause", 0, 20, { GroupId: "other" });
    command("Pause", 0, 30, { PlaylistItemId: "other" });
    await tick(0);
    expect(player.pause).not.toHaveBeenCalled();
  });

  test("drops an older command after a newer one", async () => {
    await join();
    queue();
    await ready();
    command("Unpause", 1000, 100, { EmittedAt: iso(10) });
    command("Pause", 0, 20);
    await tick(1000);
    expect(player.resume).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
  });

  test("holds command until player loaded and Ready doesn't echo playback", async () => {
    await join();
    queue();
    await settle();
    command("Unpause", 0, 30_000_000);
    await tick(0);
    expect(player.resume).not.toHaveBeenCalled();
    await ready();
    await tick(0);
    expect(player.resume).toHaveBeenCalledTimes(1);
    expect(transport.unpause).not.toHaveBeenCalled();
  });

  test("Seek pauses and reports Ready only after asynchronous engine reaches target", async () => {
    await join();
    queue();
    await ready();
    transport.ready.mockClear();
    player.seek.mockImplementation(() => {});
    command("Seek", 0, 50_000_000);
    await tick(0);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(transport.ready).not.toHaveBeenCalled();
    state.positionTicks = 50_000_000;
    controller.notifyProgress();
    await settle();
    expect(transport.ready).toHaveBeenCalledTimes(1);
    expect(transport.ready.mock.calls[0][0].PositionTicks).toBe(50_000_000);
  });

  test("re-registering the launcher during Seek cannot restart its original queue position", async () => {
    await join();
    queue();
    await ready();
    player.seek.mockImplementation(() => {});
    command("Seek", 0, 500_000_000);
    await tick(0);
    expect(player.seek).toHaveBeenLastCalledWith(500_000_000);
    controller.registerLauncher(launch);
    await settle();
    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
    state.positionTicks = 500_000_000;
    controller.notifyProgress();
    await settle();
    expect(transport.ready).toHaveBeenLastCalledWith(
      expect.objectContaining({ PositionTicks: 500_000_000 }),
    );
  });

  test("buffering and readiness report transitions, without flooding or group pause echoes", async () => {
    await join();
    queue();
    await ready();
    transport.ready.mockClear();
    state.isBuffering = true;
    controller.notifyBuffering(true);
    controller.notifyBuffering(true);
    await settle();
    expect(transport.buffering).toHaveBeenCalledTimes(1);
    expect(transport.pause).not.toHaveBeenCalled();
    controller.notifyReady();
    expect(transport.ready).not.toHaveBeenCalled();
    state.isBuffering = false;
    controller.notifyBuffering(false);
    controller.notifyReady();
    await settle();
    expect(transport.ready).toHaveBeenCalledTimes(1);
  });

  test("Pause at the current position does not seek and trigger buffering again", async () => {
    await join();
    queue();
    await ready();
    transport.buffering.mockClear();
    state.isPlaying = true;
    state.positionTicks = 990_000;
    command("Pause");
    await tick(0);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.seek).not.toHaveBeenCalled();
    expect(transport.buffering).not.toHaveBeenCalled();
    await tick(1);
    state.positionTicks = 2_000_000;
    command("Pause");
    await tick(0);
    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenCalledWith(0);
  });

  test("Ready waits for the preceding Buffering HTTP response", async () => {
    await join();
    queue();
    await ready();
    transport.ready.mockClear();
    const order: string[] = [];
    let completeBuffering!: () => void;
    transport.buffering.mockImplementationOnce(async () => {
      order.push("Buffering");
      await new Promise<void>((resolve) => {
        completeBuffering = resolve;
      });
      order.push("Buffering completed");
    });
    transport.ready.mockImplementationOnce(async () => {
      order.push("Ready");
    });
    state.isBuffering = true;
    controller.notifyBuffering(true);
    await settle();
    state.isBuffering = false;
    controller.notifyBuffering(false);
    await settle();
    expect(order).toEqual(["Buffering"]);
    expect(transport.ready).not.toHaveBeenCalled();
    completeBuffering();
    await settle();
    expect(order).toEqual(["Buffering", "Buffering completed", "Ready"]);
  });

  test("Buffering also waits for a preceding Ready HTTP response", async () => {
    await join();
    queue();
    await ready();
    transport.buffering.mockClear();
    let completeReady!: () => void;
    transport.ready.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeReady = resolve;
        }),
    );
    controller.notifyReady(true);
    await settle();
    state.isBuffering = true;
    controller.notifyBuffering(true);
    await settle();
    expect(transport.buffering).not.toHaveBeenCalled();
    completeReady();
    await settle();
    expect(transport.buffering).toHaveBeenCalledTimes(1);
  });

  test("a new playlist discards stale readiness reports waiting for HTTP", async () => {
    await join();
    queue();
    await ready();
    transport.ready.mockClear();
    let completeBuffering!: () => void;
    transport.buffering.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeBuffering = resolve;
        }),
    );
    state.isBuffering = true;
    controller.notifyBuffering(true);
    await settle();
    state.isBuffering = false;
    controller.notifyBuffering(false);
    await tick(1);
    queue(0, "movie-2", "playlist-2");
    await ready();
    completeBuffering();
    await settle();
    await settle();
    expect(transport.ready).toHaveBeenCalledTimes(1);
    expect(transport.ready.mock.calls[0][0].PlaylistItemId).toBe("playlist-2");
  });

  test("Ready queued behind a hung Buffering still releases peers at timeout", async () => {
    await join();
    for (let sample = 0; sample < 3; sample++) await tick(1000);
    queue();
    await ready();
    transport.buffering.mockImplementationOnce(() => new Promise(() => {}));
    state.isBuffering = true;
    controller.notifyBuffering(true);
    await settle();
    state.isBuffering = false;
    controller.notifyBuffering(false);
    await tick(30_000);
    expect(controller.getSnapshot().group).toBeNull();
    expect(controller.getSnapshot().error).toBe("playback_failed");
    expect(transport.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("rejoining starts fresh readiness while an old Buffering request is hung", async () => {
    await join();
    for (let sample = 0; sample < 3; sample++) await tick(1000);
    queue();
    await ready();
    let completeOldBuffering!: () => void;
    transport.buffering.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeOldBuffering = resolve;
        }),
    );
    state.isBuffering = true;
    controller.notifyBuffering(true);
    await settle();
    state.isBuffering = false;
    controller.notifyBuffering(false);
    await tick(30_000);
    expect(controller.getSnapshot().group).toBeNull();
    await join();
    queue(0, "movie-2", "playlist-2");
    await ready();
    expect(transport.ready).toHaveBeenCalledTimes(2);
    expect(transport.ready.mock.calls[1][0].PlaylistItemId).toBe("playlist-2");
    completeOldBuffering();
    await settle();
    expect(transport.ready).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
  });

  test("local drift correction seeks after grace period without group Seek requests", async () => {
    await join();
    queue();
    await ready();
    command("Unpause", 0, 0);
    await tick(0);
    await tick(4000);
    controller.notifyProgress();
    expect(player.seek).toHaveBeenLastCalledWith(40_000_000);
    expect(transport.seek).not.toHaveBeenCalled();
    const calls = player.seek.mock.calls.length;
    await tick(1000);
    state.positionTicks = 0;
    controller.notifyProgress();
    expect(player.seek).toHaveBeenCalledTimes(calls);
  });

  test("queue switches invalidate previously scheduled commands", async () => {
    await join();
    queue();
    await ready();
    command("Unpause", 1000);
    await tick(5);
    queue(0, "movie-2", "playlist-2");
    await ready();
    await tick(1000);
    expect(player.resume).not.toHaveBeenCalled();
    expect(launch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        itemId: "movie-2",
        playlistItemId: "playlist-2",
        startPositionTicks: 0,
      }),
    );
  });

  test("stale queue updates cannot switch the active movie", async () => {
    await join();
    queue();
    await ready();
    await tick(50);
    queue(0, "movie-2", "playlist-2");
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "PlayQueue",
      Data: {
        LastUpdate: new Date(epoch - 1).toISOString(),
        PlayingItemIndex: 0,
        Playlist: [{ ItemId: "old", PlaylistItemId: "old" }],
      },
    });
    expect(launch.mock.calls.map(([request]) => request.itemId)).toEqual([
      "movie-1",
      "movie-2",
    ]);
  });

  test("an old Stop cannot close a movie from a newer playlist", async () => {
    await join();
    queue();
    await ready();
    await tick(20);
    queue(0, "movie-2", "playlist-2");
    await ready();
    command("Stop", 0, 0, { EmittedAt: new Date(epoch + 10).toISOString() });
    await tick(0);
    expect(player.stop).not.toHaveBeenCalled();
    expect(state.itemId).toBe("movie-2");
  });

  test("next/previous/end requests carry current playlist item, not media id", async () => {
    await join();
    playlist();
    await ready();
    await controller.requestNext();
    await controller.requestPrevious();
    controller.notifyEnded();
    await settle();
    expect(transport.next).toHaveBeenCalledTimes(2);
    expect(transport.next).toHaveBeenCalledWith("playlist-1");
    expect(transport.previous).toHaveBeenCalledWith("playlist-1");
  });

  test("normal leave allows solo continuation and cancels future group commands", async () => {
    await join();
    queue();
    await ready();
    command("Unpause", 1000);
    await controller.leaveGroup();
    await tick(1000);
    expect(controller.getSnapshot().group).toBeNull();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.resume).not.toHaveBeenCalled();
    expect(transport.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("Stop is idempotent during navigation and suppresses teardown readiness", async () => {
    await join();
    queue();
    await ready();
    transport.ready.mockClear();
    // A route's item id remains populated until its navigation completes.
    player.stop.mockImplementation(() => {
      state.isPlaying = false;
    });
    command("Stop");
    await tick(0);
    controller.notifyReady();
    controller.notifyBuffering(true);
    await tick(5);
    command("Stop");
    await tick(0);
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(transport.ready).not.toHaveBeenCalled();
    expect(transport.buffering).not.toHaveBeenCalled();
  });

  test("Stop marks the group Idle without a separate StateUpdate", async () => {
    await join();
    queue();
    await ready();
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "StateUpdate",
      Data: { State: "Playing", Reason: "Ready" },
    });
    command("Stop", 1000);
    expect(controller.getSnapshot().groupState).toBe("Idle");
    expect(controller.getSnapshot().group?.State).toBe("Idle");
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
    expect(player.stop).not.toHaveBeenCalled();
    await tick(1000);
    expect(player.stop).toHaveBeenCalledTimes(1);
  });

  test("Stop updates an idle client's group status after its decoder unmounts", async () => {
    await join();
    queue();
    await ready();
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "StateUpdate",
      Data: { State: "Playing", Reason: "Ready" },
    });
    unregisterPlayer();
    command("Stop");
    expect(controller.getSnapshot().groupState).toBe("Idle");
    expect(controller.getSnapshot().group?.State).toBe("Idle");
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("Play after Stop reselects the current shared entry and waits for its broadcast, preserving queue and modes", async () => {
    await join();
    playlist({
      PlayingItemIndex: 1,
      RepeatMode: "RepeatAll",
      ShuffleMode: "Shuffle",
    });
    await ready();
    const before = controller.getSnapshot();
    command("Stop", 0, 0, { PlaylistItemId: "playlist-2" });
    await tick(0);
    expect(state.itemId).toBeNull();

    await controller.requestUnpause();
    expect(transport.setPlaylistItem).toHaveBeenCalledWith("playlist-2");
    expect(transport.unpause).not.toHaveBeenCalled();
    expect(transport.playItems).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(player.resume).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      playlist: before.playlist,
      playingItemIndex: 1,
      repeatMode: "RepeatAll",
      shuffleMode: "Shuffle",
      groupState: "Idle",
    });

    await tick(1);
    playlist({
      Reason: "SetCurrentItem",
      PlayingItemIndex: 1,
      RepeatMode: "RepeatAll",
      ShuffleMode: "Shuffle",
    });
    await settle();
    expect(launch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        itemId: "movie-2",
        playlistItemId: "playlist-2",
      }),
    );
    await ready();
    command("Unpause", 100, 0, { PlaylistItemId: "playlist-2" });
    await tick(100);
    expect(player.resume).toHaveBeenCalledTimes(1);

    // The reopened, ordinarily paused decoder continues using Unpause.
    await tick(1);
    command("Pause", 0, 0, { PlaylistItemId: "playlist-2" });
    await tick(0);
    await controller.requestUnpause();
    expect(transport.unpause).toHaveBeenCalledTimes(1);
    expect(transport.setPlaylistItem).toHaveBeenCalledTimes(1);
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("decoder end notifications advance playlist once until the item changes", async () => {
    await join();
    playlist();
    await ready();
    controller.notifyEnded();
    controller.notifyEnded();
    await settle();
    controller.notifyEnded();
    expect(transport.next).toHaveBeenCalledTimes(1);
    await tick(5);
    playlist({ PlayingItemIndex: 1, Reason: "NextItem" });
    await ready();
    controller.notifyEnded();
    await settle();
    expect(transport.next).toHaveBeenCalledTimes(2);
    expect(transport.next).toHaveBeenLastCalledWith("playlist-2");
  });

  test("RepeatOne NextItem reloads same playlist item and reports readiness again", async () => {
    await join();
    playlist({
      RepeatMode: "RepeatOne",
      Playlist: [{ ItemId: "movie-1", PlaylistItemId: "playlist-1" }],
    });
    await ready();
    controller.notifyEnded();
    await settle();
    state.positionTicks = 1_000_000_000;
    await tick(10);
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "PlayQueue",
      Data: {
        LastUpdate: iso(),
        Playlist: [{ ItemId: "movie-1", PlaylistItemId: "playlist-1" }],
        PlayingItemIndex: 0,
        StartPositionTicks: 0,
        Reason: "NextItem",
        RepeatMode: "RepeatOne",
      },
    });
    await settle();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenLastCalledWith(0);
    expect(transport.ready).toHaveBeenCalledTimes(2);
    controller.notifyEnded();
    await settle();
    expect(transport.next).toHaveBeenCalledTimes(2);
  });

  test.each([
    { reason: "NextItem", index: 0, playlistItemId: "playlist-1" },
    { reason: "SetCurrentItem", index: 2, playlistItemId: "playlist-3" },
  ])(
    "native $reason reloads same media and waits for the new decoder instead of seeking an unloaded file",
    async ({ reason, index, playlistItemId }) => {
      player.reloadOnQueueRestart = true;
      await join();
      playlist({ RepeatMode: "RepeatOne" });
      await ready();
      state.positionTicks = 1_200_000_000;
      controller.notifyEnded("playlist-1");
      await settle();
      await tick(10);

      playlist({
        Reason: reason,
        PlayingItemIndex: index,
        RepeatMode: "RepeatOne",
      });
      await settle();

      expect(launch).toHaveBeenCalledTimes(2);
      expect(launch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          itemId: "movie-1",
          playlistItemId,
          startPositionTicks: 0,
        }),
      );
      expect(player.seek).not.toHaveBeenCalled();
      expect(transport.ready).toHaveBeenCalledTimes(1);
      controller.notifyEnded("playlist-1");
      await settle();
      expect(transport.next).toHaveBeenCalledTimes(1);

      await ready();
      expect(transport.ready).toHaveBeenLastCalledWith(
        expect.objectContaining({ PlaylistItemId: playlistItemId }),
      );
      expect(transport.ready).toHaveBeenCalledTimes(2);

      await tick(10);
      playlist({
        Reason: "RepeatMode",
        PlayingItemIndex: index,
        RepeatMode: "RepeatAll",
      });
      await settle();
      expect(launch).toHaveBeenCalledTimes(2);
      expect(transport.leaveGroup).not.toHaveBeenCalled();
    },
  );

  test.each(["RepeatNone", "RepeatOne", "RepeatAll"] as const)(
    "final EOF with %s stops or repeats the shared group exactly once",
    async (repeatMode) => {
      await join();
      playlist({ RepeatMode: repeatMode, PlayingItemIndex: 2 });
      await ready();
      controller.notifyEnded();
      controller.notifyEnded();
      await settle();
      if (repeatMode === "RepeatNone") {
        expect(transport.stop).toHaveBeenCalledTimes(1);
        expect(transport.next).not.toHaveBeenCalled();
      } else {
        expect(transport.next).toHaveBeenCalledTimes(1);
        expect(transport.next).toHaveBeenCalledWith("playlist-3");
        expect(transport.stop).not.toHaveBeenCalled();
      }
    },
  );

  test("an EOF queued behind another action cannot advance a newer movie", async () => {
    await join();
    playlist();
    await ready();
    let complete!: () => void;
    transport.setShuffleMode.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = controller.setShuffleMode("Shuffle");
    controller.notifyEnded();
    await settle();
    await tick(1);
    playlist({ PlayingItemIndex: 1, Reason: "SetCurrentItem" });
    complete();
    await pending;
    await settle();
    expect(transport.next).not.toHaveBeenCalled();
    expect(transport.stop).not.toHaveBeenCalled();
  });

  test("replacement decoder reports buffering and Ready again for same playlist", async () => {
    await join();
    queue();
    await ready();
    command("Unpause");
    await tick(0);
    state.isReady = false;
    state.isPlaying = false;
    state.isBuffering = true;
    const replacement = { ...player };
    controller.registerPlayer(replacement);
    await settle();
    expect(transport.buffering).toHaveBeenCalledTimes(1);
    state.isReady = true;
    state.isBuffering = false;
    state.positionTicks = 30_000_000;
    controller.notifyReady();
    await settle();
    expect(transport.ready).toHaveBeenCalledTimes(2);
    expect(transport.ready.mock.calls[1][0].PositionTicks).toBe(30_000_000);
  });

  test("launcher checks become stale after playlist change or leave", async () => {
    await join();
    queue();
    await settle();
    const first = launch.mock.calls[0][0];
    expect(first.isCurrent()).toBe(true);
    await tick(1);
    queue(0, "movie-2", "playlist-2");
    await settle();
    const second = launch.mock.calls[1][0];
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    await controller.leaveGroup();
    expect(second.isCurrent()).toBe(false);
  });

  test("playlist navigation follows server index and clears after leaving", async () => {
    await join();
    const send = (index: number) =>
      controller.handleGroupUpdate({
        GroupId: group.GroupId,
        Type: "PlayQueue",
        Data: {
          LastUpdate: iso(),
          Playlist: [
            { ItemId: "a", PlaylistItemId: "qa" },
            { ItemId: "b", PlaylistItemId: "qb" },
            { ItemId: "c", PlaylistItemId: "qc" },
          ],
          PlayingItemIndex: index,
          Reason: "SetCurrentItem",
        },
      });
    send(0);
    expect(controller.getSnapshot()).toMatchObject({
      hasPrevious: false,
      hasNext: true,
    });
    await tick(1);
    send(1);
    expect(controller.getSnapshot()).toMatchObject({
      hasPrevious: true,
      hasNext: true,
    });
    await tick(1);
    send(2);
    expect(controller.getSnapshot()).toMatchObject({
      hasPrevious: true,
      hasNext: false,
    });
    await controller.leaveGroup();
    expect(controller.getSnapshot()).toMatchObject({
      hasPrevious: false,
      hasNext: false,
    });
  });

  test("disconnect pauses locally, leaves server, ignores reconnect's stale group commands", async () => {
    await join();
    queue();
    await ready();
    command("Unpause", 1000);
    controller.setConnected(false);
    controller.setConnected(true);
    command("Unpause");
    await tick(1000);
    expect(controller.getSnapshot().group).toBeNull();
    expect(controller.getSnapshot().error).toBe("disconnected");
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.resume).not.toHaveBeenCalled();
    expect(transport.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("logout cancels timers and asynchronous clock responses", async () => {
    let resolveTime!: (
      value: Awaited<ReturnType<SyncPlayTransport["getTime"]>>,
    ) => void;
    transport.getTime.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTime = resolve;
        }),
    );
    await controller.joinGroup(group.GroupId);
    controller.handleGroupUpdate({
      Type: "GroupJoined",
      GroupId: group.GroupId,
      Data: group,
    });
    controller.dispose();
    resolveTime({
      RequestReceptionTime: iso(),
      ResponseTransmissionTime: iso(),
    });
    await settle();
    expect(transport.ping).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("join timeout clears pending membership and leaves server", async () => {
    await controller.joinGroup(group.GroupId);
    await tick(15_000);
    controller.handleGroupUpdate({
      Type: "GroupJoined",
      GroupId: group.GroupId,
      Data: group,
    });
    expect(controller.getSnapshot().group).toBeNull();
    expect(controller.getSnapshot().error).toBe("timeout");
    expect(transport.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("unready player timeout releases other waiting participants", async () => {
    await join();
    queue();
    await tick(30_000);
    expect(controller.getSnapshot().group).toBeNull();
    expect(controller.getSnapshot().error).toBe("playback_failed");
    expect(transport.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("participant updates preserve separate sessions of the same user", async () => {
    await join();
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "UserJoined",
      Data: "Alice",
    });
    controller.handleGroupUpdate({
      GroupId: "other",
      Type: "UserJoined",
      Data: "Bob",
    });
    expect(controller.getSnapshot().group?.Participants).toEqual([
      "Alice",
      "Alice",
    ]);
    controller.handleGroupUpdate({
      GroupId: group.GroupId,
      Type: "UserLeft",
      Data: "Alice",
    });
    expect(controller.getSnapshot().group?.Participants).toEqual(["Alice"]);
  });

  test("server Guid.Empty errors terminate a missing join immediately", async () => {
    await controller.joinGroup("missing");
    controller.handleGroupUpdate({
      Type: "GroupDoesNotExist",
      GroupId: "00000000-0000-0000-0000-000000000000",
      Data: "",
    });
    expect(controller.getSnapshot().error).toBe("group_missing");
    await tick(15_000);
    expect(controller.getSnapshot().error).toBe("group_missing");
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("NotInGroup with Guid.Empty clears active membership", async () => {
    await join();
    queue();
    await ready();
    controller.handleGroupUpdate({
      Type: "NotInGroup",
      GroupId: "00000000-0000-0000-0000-000000000000",
      Data: "",
    });
    expect(controller.getSnapshot().group).toBeNull();
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  test("duplicate queue doesn't reopen loading player or erase scheduled command", async () => {
    await join();
    queue();
    queue();
    await ready();
    expect(launch).toHaveBeenCalledTimes(1);
    command("Unpause", 1000);
    queue();
    await tick(1000);
    expect(player.resume).toHaveBeenCalledTimes(1);
  });

  test("duplicate Seek repairs drift when server rejects inaccurate readiness", async () => {
    await join();
    queue();
    await ready();
    command("Seek", 0, 50_000_000);
    await tick(0);
    state.positionTicks = 0;
    command("Seek", 0, 50_000_000);
    await tick(0);
    expect(player.seek).toHaveBeenCalledTimes(2);
    expect(state.positionTicks).toBe(50_000_000);
    expect(transport.seek).not.toHaveBeenCalled();
  });

  test("a new queue discards Stop waiting for initial clock sync", async () => {
    let completeClock!: (value: {
      RequestReceptionTime: string;
      ResponseTransmissionTime: string;
    }) => void;
    transport.getTime.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeClock = resolve;
        }),
    );
    await join();
    queue();
    command("Stop");
    await tick(1);
    queue(0, "movie-2", "playlist-2");
    completeClock({
      RequestReceptionTime: iso(),
      ResponseTransmissionTime: iso(),
    });
    await settle();
    await tick(0);
    expect(state.itemId).toBe("movie-2");
    expect(player.stop).not.toHaveBeenCalled();
    await ready();
    command("Unpause", 0, 0, { PlaylistItemId: "playlist-2" });
    await tick(0);
    expect(player.resume).toHaveBeenCalledTimes(1);
  });

  test("failed Ready re-arms the timeout while a paused decoder cannot retry", async () => {
    await join();
    // Initial clock samples are complete; the next refresh is a minute away.
    for (let sample = 0; sample < 3; sample++) await tick(1000);
    transport.ready.mockRejectedValue(new Error("Server unavailable"));
    queue();
    await ready();
    expect(controller.getSnapshot().error).toBe("request_failed");
    expect(controller.getSnapshot().group).not.toBeNull();
    await tick(30_000);
    expect(controller.getSnapshot().group).toBeNull();
    expect(controller.getSnapshot().error).toBe("playback_failed");
    expect(transport.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("clock estimation excludes server work and schedules using server offset", async () => {
    transport.getTime.mockImplementationOnce(async () => {
      const sent = Date.now();
      jest.advanceTimersByTime(200);
      return {
        RequestReceptionTime: new Date(sent + 5080).toISOString(),
        ResponseTransmissionTime: new Date(sent + 5100).toISOString(),
      };
    });
    await join();
    queue();
    await ready();
    expect(controller.getSnapshot().clockOffsetMs).toBe(4990);
    expect(controller.getSnapshot().pingMs).toBe(90);
    command("Unpause", 5490, 10_000_000);
    await tick(499);
    expect(player.resume).not.toHaveBeenCalled();
    await tick(1);
    expect(player.resume).toHaveBeenCalledTimes(1);
    expect(transport.ready.mock.calls[0][0].When).toBe(
      new Date(epoch + 5190).toISOString(),
    );
  });

  test("native decoder receives corrected absolute deadline immediately and owns dispatch", async () => {
    let applied!: () => void;
    player.scheduleCommand = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          applied = resolve;
        }),
    );
    transport.getTime.mockImplementationOnce(async () => ({
      RequestReceptionTime: iso(5000),
      ResponseTransmissionTime: iso(5000),
    }));
    await join();
    queue();
    await ready();
    command("Unpause", 6000, 288_000_000);
    expect(player.scheduleCommand).toHaveBeenCalledTimes(1);
    expect((player.scheduleCommand as jest.Mock).mock.calls[0][1]).toBe(
      epoch + 1000,
    );
    expect(
      (player.scheduleCommand as jest.Mock).mock.calls[0][0].PositionTicks,
    ).toBe(288_000_000);
    await tick(2000);
    expect(player.resume).not.toHaveBeenCalled();
    expect(player.seek).not.toHaveBeenCalled();
    state.positionTicks = 298_000_000;
    state.isPlaying = true;
    applied();
    await settle();
    controller.notifyProgress();
    expect(player.seek).not.toHaveBeenCalled();
  });

  test("native seek Ready waits for deadline resolution and physical target", async () => {
    let applied!: () => void;
    player.scheduleCommand = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          applied = resolve;
        }),
    );
    await join();
    queue();
    await ready();
    transport.ready.mockClear();
    command("Seek", 1000, 288_000_000);
    state.positionTicks = 288_000_000;
    controller.notifyProgress();
    await settle();
    expect(transport.ready).not.toHaveBeenCalled();
    state.positionTicks = 0;
    applied();
    await settle();
    expect(transport.ready).not.toHaveBeenCalled();
    state.positionTicks = 288_000_000;
    controller.notifyProgress();
    await settle();
    expect(transport.ready).toHaveBeenCalledTimes(1);
    expect(transport.ready.mock.calls[0][0].PositionTicks).toBe(288_000_000);
    expect(player.seek).not.toHaveBeenCalled();
  });

  test("superseded native seek rejection cannot leave current group", async () => {
    let cancelOld!: () => void;
    player.scheduleCommand = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            cancelOld = () => reject(new Error("cancelled"));
          }),
      )
      .mockResolvedValue(undefined);
    player.cancelScheduledCommands = jest.fn(() => cancelOld?.());
    await join();
    queue();
    await ready();
    command("Seek", 1000, 288_000_000);
    command("Pause", 1000, 288_000_000, { EmittedAt: iso(1) });
    await settle();
    expect(player.scheduleCommand).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("native scheduler cancellation follows queue replacement, unregister and leave", async () => {
    player.scheduleCommand = jest.fn(() => new Promise<void>(() => {}));
    player.cancelScheduledCommands = jest.fn();
    await join();
    queue();
    await ready();
    command("Unpause", 1000);
    (player.cancelScheduledCommands as jest.Mock).mockClear();
    queue(0, "movie-2", "playlist-2");
    await settle();
    expect(player.cancelScheduledCommands).toHaveBeenCalled();
    (player.cancelScheduledCommands as jest.Mock).mockClear();
    unregisterPlayer();
    expect(player.cancelScheduledCommands).toHaveBeenCalledTimes(1);
    controller.registerPlayer(player);
    (player.cancelScheduledCommands as jest.Mock).mockClear();
    await controller.leaveGroup();
    expect(player.cancelScheduledCommands).toHaveBeenCalledTimes(1);
  });

  test("metadata-only queue edits preserve native scheduled transport", async () => {
    player.scheduleCommand = jest.fn(() => new Promise<void>(() => {}));
    player.cancelScheduledCommands = jest.fn();
    await join();
    queue();
    await ready();
    command("Unpause", 1000);
    (player.cancelScheduledCommands as jest.Mock).mockClear();
    playlist({
      Reason: "RepeatMode",
      RepeatMode: "RepeatAll",
      LastUpdate: iso(1),
    });
    expect(player.cancelScheduledCommands).not.toHaveBeenCalled();
    expect(player.scheduleCommand).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().repeatMode).toBe("RepeatAll");
  });

  test("native Stop unregistering decoder retains group without readiness timeout", async () => {
    player.scheduleCommand = jest.fn(async (request) => {
      if (request.Command === "Stop") {
        unregisterPlayer();
        state.itemId = null;
      }
    });
    await join();
    queue();
    await ready();
    controller.notifyBuffering(true);
    command("Stop");
    await settle();
    await tick(30_000);
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
    expect(controller.getSnapshot().groupState).toBe("Idle");
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("same-item native decoder reload cancels old deadline without leaving and reapplies when ready", async () => {
    let cancelOld!: () => void;
    player.scheduleCommand = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            cancelOld = () => reject(new Error("cancelled by native load"));
          }),
      )
      .mockResolvedValue(undefined);
    player.cancelScheduledCommands = jest.fn(() => cancelOld?.());
    await join();
    queue();
    await ready();
    command("Unpause", 1000, 288_000_000);
    state.isReady = false;
    state.isBuffering = true;
    controller.notifyBuffering(true);
    await settle();
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
    expect(transport.leaveGroup).not.toHaveBeenCalled();
    expect(player.scheduleCommand).toHaveBeenCalledTimes(1);
    state.isReady = true;
    state.isBuffering = false;
    controller.notifyReady();
    await settle();
    expect(player.scheduleCommand).toHaveBeenCalledTimes(2);
    expect(transport.ready).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().error).toBeNull();
  });

  test("native seek Buffering before promise completion cannot cancel and repeat the seek", async () => {
    let applied!: () => void;
    player.scheduleCommand = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          applied = resolve;
        }),
    );
    player.cancelScheduledCommands = jest.fn();
    await join();
    queue();
    await ready();
    transport.ready.mockClear();
    command("Seek", 0, 288_000_000);
    (player.cancelScheduledCommands as jest.Mock).mockClear();
    // Seeking buffers an already loaded decoder without removing its seek
    // capability. Expo may deliver this event before the native promise.
    state.isBuffering = true;
    controller.notifyBuffering(true);
    await settle();
    expect(player.cancelScheduledCommands).not.toHaveBeenCalled();
    state.positionTicks = 288_000_000;
    applied();
    await settle();
    expect(transport.ready).not.toHaveBeenCalled();
    state.isBuffering = false;
    controller.notifyBuffering(false);
    await settle();
    expect(player.scheduleCommand).toHaveBeenCalledTimes(1);
    expect(transport.ready).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
  });

  test("native Stop invalidates a launch still negotiating without leaving membership", async () => {
    player.reloadOnQueueRestart = true;
    let releaseLaunch!: () => void;
    let requestIsCurrent!: () => boolean;
    launch.mockImplementationOnce(async (request) => {
      requestIsCurrent = request.isCurrent;
      await new Promise<void>((resolve) => {
        releaseLaunch = resolve;
      });
    });
    player.scheduleCommand = jest.fn().mockResolvedValue(undefined);
    await join();
    queue();
    await settle();
    expect(requestIsCurrent()).toBe(true);
    command("Stop");
    await settle();
    expect(requestIsCurrent()).toBe(false);
    releaseLaunch();
    await settle();
    await tick(30_000);
    expect(controller.getSnapshot().group?.GroupId).toBe(group.GroupId);
    expect(controller.getSnapshot().groupState).toBe("Idle");
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("native same-media reload holds transport until the current launch settles, including Ready during presentation", async () => {
    player.reloadOnQueueRestart = true;
    player.scheduleCommand = jest.fn().mockResolvedValue(undefined);
    await join();
    playlist({ RepeatMode: "RepeatOne" });
    await ready();
    state.positionTicks = 1_190_000_000;
    const finishes: Array<() => void> = [];
    launch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishes.push(resolve);
        }),
    );
    await tick(1);
    playlist({ Reason: "NextItem", RepeatMode: "RepeatOne" });
    await settle();
    command("Unpause", 1000);
    expect(player.scheduleCommand).not.toHaveBeenCalled();

    // A second same-entry restart supersedes the still-negotiating source.
    await tick(1);
    playlist({ Reason: "NextItem", RepeatMode: "RepeatOne" });
    await settle();
    command("Unpause", 1000);
    await tick(1);
    command("Pause", 1000);
    // The new source can become ready before the present/load promise returns.
    state.positionTicks = 0;
    controller.notifyReady();
    await settle();
    expect(player.scheduleCommand).not.toHaveBeenCalled();

    finishes[0]();
    await settle();
    expect(player.scheduleCommand).not.toHaveBeenCalled();
    finishes[1]();
    await settle();
    expect(player.scheduleCommand).toHaveBeenCalledTimes(1);
    expect(player.scheduleCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Command: "Pause",
        PlaylistItemId: "playlist-1",
      }),
      Date.now() + 1000,
    );
    expect(transport.leaveGroup).not.toHaveBeenCalled();
  });

  test("outgoing native EOF cannot advance the new entry while its decoder is negotiating", async () => {
    await join();
    playlist();
    await ready();
    let releaseLaunch!: () => void;
    launch.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseLaunch = resolve;
      });
    });
    await tick(1);
    playlist({ PlayingItemIndex: 1, Reason: "NextItem", LastUpdate: iso() });
    await settle();
    expect(state.itemId).toBe("movie-1");
    controller.notifyEnded("playlist-1");
    controller.notifyEnded();
    controller.notifyEnded("playlist-2");
    await settle();
    expect(transport.next).not.toHaveBeenCalled();
    expect(transport.stop).not.toHaveBeenCalled();
    state.itemId = "movie-2";
    state.isReady = false;
    controller.notifyEnded("playlist-2");
    await settle();
    expect(transport.next).not.toHaveBeenCalled();
    state.isReady = true;
    controller.notifyReady();
    controller.notifyEnded("playlist-2");
    await settle();
    expect(transport.next).toHaveBeenCalledWith("playlist-2");
    releaseLaunch();
    await settle();
  });

  test("same-entry repeat ignores old decoder EOF while its replacement launch is negotiating", async () => {
    player.reloadOnQueueRestart = true;
    await join();
    playlist({ RepeatMode: "RepeatOne" });
    await ready();
    let releaseLaunch!: () => void;
    launch.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseLaunch = resolve;
      });
    });
    state.positionTicks = 1_199_000_000;
    await tick(1);
    playlist({ Reason: "NextItem", RepeatMode: "RepeatOne" });
    await settle();

    // The previous decoder is still loaded and exposes the same media and
    // queue identity until playback configuration resolves for its replacement.
    expect(state.isReady).toBe(true);
    controller.notifyEnded("playlist-1");
    controller.notifyEnded();
    await settle();
    expect(transport.next).not.toHaveBeenCalled();
    expect(transport.stop).not.toHaveBeenCalled();

    releaseLaunch();
    await settle();
    state.positionTicks = 0;
    controller.notifyReady();
    await settle();
    state.positionTicks = 1_200_000_000;
    controller.notifyEnded("playlist-1");
    await settle();
    expect(transport.next).toHaveBeenCalledTimes(1);
  });

  test("duplicate movie entries require the EOF decoder's exact playlist identity", async () => {
    await join();
    playlist({
      Playlist: [
        { ItemId: "movie-1", PlaylistItemId: "first-copy" },
        { ItemId: "movie-1", PlaylistItemId: "second-copy" },
      ],
      PlayingItemIndex: 1,
    });
    await ready();
    controller.notifyEnded("first-copy");
    await settle();
    expect(transport.stop).not.toHaveBeenCalled();
    controller.notifyEnded("second-copy");
    await settle();
    expect(transport.stop).toHaveBeenCalledTimes(1);
  });
});
