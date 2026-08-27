import { mock } from "bun:test";

type StoredValue = boolean | number | string;

const values = new Map<string, StoredValue>();

/**
 * `bun:test` cannot load react-native-mmkv, which needs its native module, so
 * specs stub it. `mock.module` is global and `@/utils/mmkv` builds its
 * `storage` instance once at module evaluation, so a single stub ends up
 * backing every spec in the run — and which one that is depends on file order,
 * which bun does not promise. When each spec brought its own stub, a spec that
 * only needed the import to resolve could hand the whole run a store that
 * silently dropped every write, and the specs that persist for real (the
 * per-series track memory) failed on some runs and passed on others.
 *
 * One double, one backing map, so the winner no longer matters. Only the
 * methods the app calls on `storage` are implemented; `setAny` and `get` are
 * not among them because `augmentations/mmkv.ts` layers those onto the
 * instance out of `getString`, `set` and `remove`.
 */
export const stubMmkv = () =>
  mock.module("react-native-mmkv", () => ({
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
  }));

/** Empties the shared store. Call it from `beforeEach` so specs stay isolated. */
export const clearMmkv = () => values.clear();
