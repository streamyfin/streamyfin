/**
 * Shared in-memory stand-in for react-native-mmkv.
 *
 * `mock.module` is process-wide in bun, so a suite that registers its own mock
 * over a private map silently takes over every other suite too: their writes
 * land in this map while their `beforeEach` clears the one nothing uses, and
 * state leaks between their tests. Each file passes alone and the set fails
 * together, depending on load order.
 *
 * Every suite that needs storage goes through this one double, and clears
 * `mmkvStore` between tests.
 */
export const mmkvStore = new Map<string, string>();

export const mmkvMock = () => ({
  createMMKV: () => ({
    getString: (key: string) => mmkvStore.get(key),
    getBoolean: (key: string) => mmkvStore.get(key) === "true",
    set: (key: string, value: string | boolean) => {
      mmkvStore.set(key, String(value));
    },
    delete: (key: string) => {
      mmkvStore.delete(key);
    },
    remove: (key: string) => {
      mmkvStore.delete(key);
    },
    getAllKeys: () => Array.from(mmkvStore.keys()),
  }),
});
