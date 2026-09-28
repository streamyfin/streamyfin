import { mock } from "bun:test";

const values = new Map<string, string>();

/**
 * `expo-secure-store` needs its native module, so specs stub it, and
 * `mock.module` is global: two specs bringing two doubles of the same module
 * hand the whole run whichever registered last. One double, one backing map,
 * with the synchronous and the asynchronous halves of the API the app calls.
 */
export const stubSecureStore = () =>
  mock.module("expo-secure-store", () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) =>
      void values.set(key, value),
    deleteItemAsync: async (key: string) => void values.delete(key),
  }));

export const clearSecureStore = () => values.clear();

/** What a spec needs to set up or read back the stored values directly. */
export const secureStoreValues = values;
