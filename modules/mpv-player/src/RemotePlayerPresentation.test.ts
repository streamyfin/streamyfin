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
};

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
});
