const values = new Map<string, string>();

/**
 * An expo-secure-store double for specs, which cannot load its native module.
 * Wire it at the top of a spec, where Jest hoists it above the imports:
 *
 *   jest.mock("expo-secure-store", () =>
 *     jest.requireActual("@/test-utils/secureStore").secureStoreModule,
 *   );
 *
 * One backing map serves the whole spec, and Jest's per-file module registry
 * keeps it from reaching any other. It carries the synchronous and the
 * asynchronous halves of the API the app calls.
 */
export const secureStoreModule = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => void values.set(key, value),
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) =>
    void values.set(key, value),
  deleteItemAsync: async (key: string) => void values.delete(key),
};

/** Empties the store. Call it from `beforeEach` so tests stay isolated. */
export const clearSecureStore = () => values.clear();

/** What a spec needs to set up or read back the stored values directly. */
export const secureStoreValues = values;
