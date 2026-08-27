/**
 * Shared in-memory stand-in for expo-secure-store.
 *
 * `mock.module` is process-wide in bun, so two test files that each mock
 * expo-secure-store with their own backing map clobber one another: whichever
 * registers last wins, and the other file's assertions read a map nothing
 * writes to. Both suites go through this one double instead.
 *
 * Covers the sync and async halves of the API, since callers use both.
 */
export const secureStoreValues = new Map<string, string>();

export const secureStoreMock = () => ({
  getItem: (key: string) => secureStoreValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    secureStoreValues.set(key, value);
  },
  getItemAsync: async (key: string) => secureStoreValues.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStoreValues.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStoreValues.delete(key);
  },
});
