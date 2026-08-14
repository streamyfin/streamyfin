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
 * `mmkvStore` between tests. It mirrors the methods this codebase calls — no
 * more, so a call the real v4 API does not have cannot pass here.
 */
export const mmkvStore = new Map<string, string>();

export const mmkvMock = () => ({
  createMMKV: () => ({
    getString: (key: string) => mmkvStore.get(key),
    getBoolean: (key: string) =>
      mmkvStore.has(key) ? mmkvStore.get(key) === "true" : undefined,
    getNumber: (key: string) =>
      mmkvStore.has(key) ? Number(mmkvStore.get(key)) : undefined,
    getAllKeys: () => Array.from(mmkvStore.keys()),
    set: (key: string, value: string | number | boolean) => {
      mmkvStore.set(key, String(value));
    },
    setAny: (key: string, value: unknown) => {
      mmkvStore.set(key, JSON.stringify(value));
    },
    remove: (key: string) => mmkvStore.delete(key),
  }),
});
