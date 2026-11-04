import { NO_REMOTE_TARGET } from "./Cast.types";
import {
  addCastChannel,
  castDevices,
  castState,
  connectToCastDevice,
  currentCastSession,
  disconnectRemoteTarget,
  isCastAvailable,
  onCastSessionEvent,
  onRemoteTargetChanged,
  presentOutputPicker,
  remoteTarget,
  setRemoteTargetMuted,
  setRemoteTargetVolume,
  showExpandedControls,
} from "./cast";

// A bundle without the native module (web, a build that left it out): the
// require throws, CastModule.ts keeps null, and the API answers as if no Cast
// target could ever exist.
jest.mock("expo", () => ({
  requireNativeModule: () => {
    throw new Error("Cannot find native module 'StreamyfinCast'");
  },
}));

test("every call is a no-op when the native module is missing", async () => {
  expect(isCastAvailable()).toBe(false);
  expect(castState()).toBeNull();
  expect(castDevices()).toEqual([]);
  expect(currentCastSession()).toBeNull();
  await expect(showExpandedControls()).resolves.toBe(false);

  const channel = await addCastChannel("urn:x-cast:com.connectsdk", () => {});
  expect(channel.connected).toBe(false);
  await expect(channel.sendMessage("hi")).rejects.toThrow(
    "Cast is not available on this platform",
  );
  expect(onCastSessionEvent(() => {}).remove).toBeInstanceOf(Function);
});

test("no remote target can exist when the native module is missing", async () => {
  expect(remoteTarget()).toEqual(NO_REMOTE_TARGET);
  await expect(connectToCastDevice("device-a")).resolves.toBe(false);
  await expect(disconnectRemoteTarget()).resolves.toBeUndefined();
  expect(onRemoteTargetChanged(() => {}).remove).toBeInstanceOf(Function);
});

test("setRemoteTargetVolume and setRemoteTargetMuted both do nothing without the module", async () => {
  await expect(setRemoteTargetVolume(0.5)).resolves.toBeUndefined();
  await expect(setRemoteTargetMuted(true)).resolves.toBeUndefined();
});

test("presentOutputPicker resolves false without the module", async () => {
  await expect(presentOutputPicker({ strings: {} })).resolves.toBe(false);
});
