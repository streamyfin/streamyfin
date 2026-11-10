import {
  addCastChannel,
  castDevices,
  castState,
  currentCastSession,
  isCastAvailable,
  onCastSessionEvent,
  showCastDialog,
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
  await expect(showCastDialog()).resolves.toBe(false);

  const channel = await addCastChannel("urn:x-cast:com.connectsdk", () => {});
  expect(channel.connected).toBe(false);
  await expect(channel.sendMessage("hi")).rejects.toThrow(
    "Cast is not available on this platform",
  );
  expect(onCastSessionEvent(() => {}).remove).toBeInstanceOf(Function);
});
