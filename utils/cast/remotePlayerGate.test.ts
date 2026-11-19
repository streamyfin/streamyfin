import { remotePlayerRouted } from "./remotePlayerGate";

const devFlag = globalThis as { __DEV__?: boolean };
const original = devFlag.__DEV__;

afterEach(() => {
  devFlag.__DEV__ = original;
});

// Until every entry opens the native remote player (PR 9), only a development build reaches it.
test("a development build routes casts to the native remote player", () => {
  devFlag.__DEV__ = true;
  expect(remotePlayerRouted()).toBe(true);
});

test("a release build keeps today's sender", () => {
  devFlag.__DEV__ = false;
  expect(remotePlayerRouted()).toBe(false);
});
