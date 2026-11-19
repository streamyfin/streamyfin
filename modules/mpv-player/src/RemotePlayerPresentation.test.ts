import {
  createNativePlayerDoubleState,
  emitNativePlayerEvent,
  type NativePlayerDoubleState,
} from "@/test-utils/nativePlayer";
import { stubReactNative } from "@/test-utils/reactNative";
import { addNativePlayerListener } from "./NativePlayerPresentation";
import {
  addRemotePlayerListener,
  isRemotePlayerAvailable,
  presentRemotePlayer,
  showRemotePlayerFailure,
  updateRemotePlayer,
  updateRemotePlayerTint,
} from "./RemotePlayerPresentation";
import type { RemotePlayerPresentConfig } from "./RemotePlayerPresentation.types";

let mockPlayer: NativePlayerDoubleState = createNativePlayerDoubleState();
jest.mock("@/modules/mpv-player/src/NativePlayerModule", () => ({
  __esModule: true,
  // The factory runs before this file's body, so the state is read lazily.
  NativePlayerNativeModule:
    require("@/test-utils/nativePlayer").nativePlayerDoubleModule(
      () => mockPlayer,
    ),
}));

const closed = { positionSec: 12, durationSec: 120 };

const config: RemotePlayerPresentConfig = {
  metadata: { itemId: "item", title: "Bench episode", isEpisode: true },
  targetName: "Bench TV",
  chapters: [],
  segments: [],
  trickplay: null,
  nextEpisode: null,
  episodeList: [],
  tracks: null,
  ui: {},
  tint: null,
};

const tint = { top: "#1F3340", bottom: "#0E1A21", accent: "#C9A7FB" };

beforeEach(() => {
  mockPlayer = createNativePlayerDoubleState();
  stubReactNative({ OS: "android" });
});

describe("presentRemotePlayer", () => {
  it("presentRemotePlayer passes the config to native", async () => {
    await presentRemotePlayer(config);

    expect(mockPlayer.remotePresented).toEqual([config]);
    expect(mockPlayer.presented).toEqual([]);
    expect(isRemotePlayerAvailable()).toBe(true);
  });

  it("presentRemotePlayer rejects on TV", async () => {
    stubReactNative({ OS: "android", isTV: true });

    await expect(presentRemotePlayer(config)).rejects.toThrow();
    expect(mockPlayer.remotePresented).toEqual([]);
    expect(isRemotePlayerAvailable()).toBe(false);
  });
});

describe("updateRemotePlayerTint", () => {
  it("hands the tint to the remote screen", async () => {
    await updateRemotePlayerTint(tint);

    expect(mockPlayer.remoteTints).toEqual([tint]);
  });

  it("sends nothing on TV, where no remote screen opens", async () => {
    stubReactNative({ OS: "android", isTV: true });

    await updateRemotePlayerTint(tint);

    expect(mockPlayer.remoteTints).toEqual([]);
  });
});

describe("updateRemotePlayer", () => {
  it("updateRemotePlayer passes the config to native", async () => {
    const next = { ...config, targetName: "Kitchen TV" };

    await expect(updateRemotePlayer(next)).resolves.toBe(true);
    mockPlayer.remoteUpdateAnswer = false;
    await expect(updateRemotePlayer(config)).resolves.toBe(false);

    expect(mockPlayer.remoteUpdates).toEqual([next, config]);
    expect(mockPlayer.remotePresented).toEqual([]);
  });

  it("answers false on TV and sends nothing", async () => {
    stubReactNative({ OS: "android", isTV: true });

    await expect(updateRemotePlayer(config)).resolves.toBe(false);
    expect(mockPlayer.remoteUpdates).toEqual([]);
  });
});

describe("showRemotePlayerFailure", () => {
  it("showRemotePlayerFailure passes the failure and clears it with null", async () => {
    const failure = {
      message: "The TV could not play this",
      canPlayHere: true,
    };

    await showRemotePlayerFailure(failure);
    await showRemotePlayerFailure(null);

    expect(mockPlayer.remoteFailures).toEqual([failure, null]);
  });

  it("sends nothing on TV", async () => {
    stubReactNative({ OS: "android", isTV: true });

    await showRemotePlayerFailure({ message: "x", canPlayHere: false });
    expect(mockPlayer.remoteFailures).toEqual([]);
  });
});

describe("remote events", () => {
  it("a remote event never reaches a local player listener", () => {
    const local = jest.fn();
    addNativePlayerListener("onDismiss", local);

    emitNativePlayerEvent(mockPlayer, "onDismiss", {
      ...closed,
      reason: "closeButton",
      remote: true,
    });
    emitNativePlayerEvent(mockPlayer, "onDismiss", {
      ...closed,
      reason: "closeButton",
    });

    expect(local).toHaveBeenCalledTimes(1);
    expect(local).toHaveBeenCalledWith({ ...closed, reason: "closeButton" });
  });

  it("a remote listener only hears remote events", () => {
    const remote = jest.fn();
    addRemotePlayerListener("onDismiss", remote);

    emitNativePlayerEvent(mockPlayer, "onDismiss", {
      ...closed,
      reason: "closeButton",
    });
    emitNativePlayerEvent(mockPlayer, "onDismiss", {
      ...closed,
      reason: "programmatic",
      remote: true,
    });

    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledWith({
      ...closed,
      reason: "programmatic",
      remote: true,
    });
  });

  it("Play here reaches a remote listener with the TV's position", () => {
    const playHere = jest.fn();
    addRemotePlayerListener("onPlayHereRequested", playHere);

    emitNativePlayerEvent(mockPlayer, "onPlayHereRequested", {
      positionSec: 42,
      remote: true,
    });

    expect(playHere).toHaveBeenCalledWith({ positionSec: 42, remote: true });
  });
});
