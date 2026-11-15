type StoredValue = boolean | number | string;

const values = new Map<string, StoredValue>();

/**
 * A react-native-mmkv double for specs, which cannot load its native module.
 * `moduleNameMapper` sends every Jest `react-native-mmkv` import to
 * `test-utils/mmkvModule.ts`, which re-exports this surface, so a spec needs
 * no mock of its own; one needing a different shape still wires a local
 * `jest.mock`.
 *
 * `@/utils/mmkv` builds its `storage` instance once at module evaluation, so
 * one backing map serves the whole spec, and Jest's per-file module registry
 * keeps it from reaching any other. Only the methods the app calls on
 * `storage` are implemented; `setAny` and `get` are not among them because
 * `augmentations/mmkv.ts` layers those onto the instance out of `getString`,
 * `set` and `remove`.
 */
export const mmkvModule = {
  createMMKV: () => ({
    set: (key: string, value: StoredValue) => void values.set(key, value),
    getString: (key: string) => values.get(key) as string | undefined,
    getNumber: (key: string) => values.get(key) as number | undefined,
    getBoolean: (key: string) => values.get(key) as boolean | undefined,
    contains: (key: string) => values.has(key),
    remove: (key: string) => values.delete(key),
    getAllKeys: () => [...values.keys()],
    clearAll: () => values.clear(),
  }),
  useMMKVString: () => [undefined, () => undefined],
};

/** Empties the store. Call it from `beforeEach` so tests stay isolated. */
export const clearMmkv = () => values.clear();
