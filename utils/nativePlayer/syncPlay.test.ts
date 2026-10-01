import { describe, expect, mock, test } from "bun:test";
import {
  canDispatchNativeSyncPlayAction,
  createNativeSyncPlayControls,
  dispatchNativeSyncPlayAction,
  dispatchNativeSyncPlayQueueCommand,
  type NativeSyncPlayPlaybackState,
  selectNativeSyncPlayEpisode,
  shouldSyncNativePlayback,
} from "./syncPlay";

const fixture = () => {
  const state: NativeSyncPlayPlaybackState = {
    positionMs: 1250,
    playbackSpeed: 1,
    isPlaying: false,
    isBuffering: false,
    awaitingLoad: false,
  };
  const transport = {
    play: mock(async () => {}),
    pause: mock(async () => {}),
    stop: mock(async () => {}),
    seekTo: mock(async (_seconds: number) => {}),
    setSpeed: mock(async (_speed: number) => {}),
  };
  const onError = mock((_action: string, _error: unknown) => {});
  const current = { value: true };
  const controls = createNativeSyncPlayControls(
    state,
    transport,
    () => current.value,
    onError,
    "current-episode",
  );
  return { state, transport, controls, current, onError };
};

describe("native SyncPlay eligibility", () => {
  test("ordinary playback remains local when no group is active", () => {
    expect(shouldSyncNativePlayback({ offline: false }, false)).toBe(false);
    expect(
      shouldSyncNativePlayback({ offline: true, syncPlay: true }, false),
    ).toBe(false);
  });

  test("an explicitly downloaded local session stays out of group playback", () => {
    expect(shouldSyncNativePlayback({ offline: true }, true)).toBe(false);
  });

  test("server-requested downloaded playback is synchronized", () => {
    expect(
      shouldSyncNativePlayback({ offline: true, syncPlay: true }, true),
    ).toBe(true);
    expect(shouldSyncNativePlayback({ offline: false }, true)).toBe(true);
  });
});

describe("native SyncPlay transport adapter", () => {
  test("server transport calls native methods without sending group requests", () => {
    const { controls, transport } = fixture();
    controls.play();
    controls.pause();
    controls.seekTo(12_345);
    expect(transport.play).toHaveBeenCalledTimes(1);
    expect(transport.pause).toHaveBeenCalledTimes(1);
    expect(transport.seekTo).toHaveBeenCalledWith(12.345);
    controls.seekTo(-1000);
    expect(transport.seekTo).toHaveBeenLastCalledWith(0);
  });

  test("state getters read the current native event values", () => {
    const { controls, state } = fixture();
    state.positionMs = 78_901;
    state.isPlaying = true;
    state.isBuffering = true;
    expect(controls.getCurrentPosition()).toBe(78_901);
    expect(controls.isPlaying()).toBe(true);
    expect(controls.isBuffering()).toBe(true);
    state.isBuffering = false;
    expect(controls.isBuffering()).toBe(false);
  });

  test("loading and replaced sessions cannot control the new player", () => {
    const { controls, state, transport, current } = fixture();
    state.awaitingLoad = true;
    expect(controls.isBuffering()).toBe(true);
    controls.play();
    controls.seekTo(2000);
    state.awaitingLoad = false;
    current.value = false;
    controls.pause();
    controls.setSpeed(1.01);
    expect(transport.play).not.toHaveBeenCalled();
    expect(transport.pause).not.toHaveBeenCalled();
    expect(transport.seekTo).not.toHaveBeenCalled();
    expect(transport.setSpeed).not.toHaveBeenCalled();
  });

  test("speed corrections update the session without changing user settings", async () => {
    const { controls, transport } = fixture();
    controls.setSpeed(1.01);
    await Promise.resolve();
    expect(transport.setSpeed).toHaveBeenCalledWith(1.01);
    expect(controls.getSpeed()).toBe(1.01);
  });

  test("native command failures are surfaced", async () => {
    const { controls, transport, onError } = fixture();
    const error = new Error("native session closed");
    transport.play.mockRejectedValueOnce(error);
    controls.play();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith("play", error);
  });

  test("a failed speed correction leaves the reported speed unchanged", async () => {
    const { controls, transport, onError } = fixture();
    const error = new Error("speed change failed");
    transport.setSpeed.mockRejectedValueOnce(error);
    controls.setSpeed(1.01);
    await Promise.resolve();
    await Promise.resolve();
    expect(controls.getSpeed()).toBe(1);
    expect(onError).toHaveBeenCalledWith("speed", error);
  });
});

describe("delegated native actions", () => {
  test("episode picks carry resume data and discard stale lookup completions", async () => {
    const item = {
      Id: "episode",
      UserData: { PlaybackPositionTicks: 123_000_000 },
    };
    const controller = { goToItem: mock(() => {}) };
    await selectNativeSyncPlayEpisode(
      "episode",
      async () => item,
      controller,
      () => true,
    );
    expect(controller.goToItem).toHaveBeenCalledWith(item);
    await selectNativeSyncPlayEpisode(
      "episode",
      async () => item,
      controller,
      () => false,
    );
    expect(controller.goToItem).toHaveBeenCalledTimes(1);
  });

  test("remote next/previous dispatch once to the group rather than silently disappearing", () => {
    const controller = {
      nextItem: mock(() => {}),
      previousItem: mock(() => {}),
    };
    expect(dispatchNativeSyncPlayQueueCommand("NextTrack", controller)).toBe(
      true,
    );
    expect(
      dispatchNativeSyncPlayQueueCommand("PreviousTrack", controller),
    ).toBe(true);
    expect(dispatchNativeSyncPlayQueueCommand("Pause", controller)).toBe(false);
    expect(controller.nextItem).toHaveBeenCalledTimes(1);
    expect(controller.previousItem).toHaveBeenCalledTimes(1);
  });

  const controller = () => ({
    unpause: mock(() => {}),
    pause: mock(() => {}),
    playPause: mock(() => {}),
    seek: mock((_ticks: number) => {}),
  });

  const loadingSession = {
    item: { Id: "current-episode" },
    offline: false,
    syncPlay: true,
    awaitingLoad: true,
  };

  test("play, pause and toggle still reach the group during initial loading", () => {
    const group = controller();
    for (const action of ["play", "pause", "toggle"] as const) {
      const request = { action, itemId: "current-episode" };
      expect(
        canDispatchNativeSyncPlayAction(request, loadingSession, true),
      ).toBe(true);
      dispatchNativeSyncPlayAction(request, group);
    }
    expect(group.unpause).toHaveBeenCalledTimes(1);
    expect(group.pause).toHaveBeenCalledTimes(1);
    expect(group.playPause).toHaveBeenCalledTimes(1);
  });

  test("loading does not let stale items or non-group sessions send commands", () => {
    expect(
      canDispatchNativeSyncPlayAction(
        { action: "toggle", itemId: "previous-episode" },
        loadingSession,
        true,
      ),
    ).toBe(false);
    expect(
      canDispatchNativeSyncPlayAction(
        { action: "toggle" },
        loadingSession,
        false,
      ),
    ).toBe(false);
    expect(
      canDispatchNativeSyncPlayAction(
        { action: "toggle" },
        { ...loadingSession, offline: true, syncPlay: false },
        true,
      ),
    ).toBe(false);
  });

  test("seek waits for the active media to load, but remains available during rebuffering", () => {
    const request = {
      action: "seek" as const,
      positionSec: 12,
      itemId: "current-episode",
    };
    expect(canDispatchNativeSyncPlayAction(request, loadingSession, true)).toBe(
      false,
    );
    expect(
      canDispatchNativeSyncPlayAction(
        request,
        { ...loadingSession, awaitingLoad: false },
        true,
      ),
    ).toBe(true);
  });

  test("play and pause are explicit intents, never stale-state toggles", () => {
    const group = controller();
    dispatchNativeSyncPlayAction({ action: "play" }, group);
    dispatchNativeSyncPlayAction({ action: "play" }, group);
    dispatchNativeSyncPlayAction({ action: "pause" }, group);
    expect(group.unpause).toHaveBeenCalledTimes(2);
    expect(group.pause).toHaveBeenCalledTimes(1);
    expect(group.seek).not.toHaveBeenCalled();
  });

  test("fractional native seconds become Jellyfin ticks", () => {
    const group = controller();
    dispatchNativeSyncPlayAction(
      { action: "seek", positionSec: 12.345 },
      group,
    );
    expect(group.seek).toHaveBeenCalledWith(123_450_000);
    dispatchNativeSyncPlayAction({ action: "seek", positionSec: -5 }, group);
    expect(group.seek).toHaveBeenLastCalledWith(0);
  });

  test("toggle taps use the group's pending playback state", () => {
    const group = controller();
    dispatchNativeSyncPlayAction({ action: "toggle" }, group);
    expect(group.playPause).toHaveBeenCalledTimes(1);
    expect(group.unpause).not.toHaveBeenCalled();
    expect(group.pause).not.toHaveBeenCalled();
  });

  test("non-finite seeks cannot reach the group API", () => {
    const group = controller();
    for (const positionSec of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        dispatchNativeSyncPlayAction({ action: "seek", positionSec }, group),
      ).toThrow("finite position");
    }
    expect(group.seek).not.toHaveBeenCalled();
  });
});
