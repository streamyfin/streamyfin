const values = new Map<string, string>();
const accessibility = new Map<string, number>();
let locked = false;

type Options = { keychainAccessible?: number };

const AFTER_FIRST_UNLOCK = 1;

/**
 * A locked iPhone refuses to read an item unless it was stored as readable
 * after the first unlock, which is how iOS answers an app it launched in the
 * background. The message is the Keychain's own.
 */
const read = (key: string) => {
  // An item that is not there is not found, locked or not.
  if (!values.has(key)) return null;
  if (locked && accessibility.get(key) !== AFTER_FIRST_UNLOCK) {
    throw new Error(
      "Calling the 'getValueWithKeySync' function has failed → Caused by: User interaction is not allowed.",
    );
  }
  return values.get(key) ?? null;
};

/**
 * The accessibility is set when an item is created and survives every later
 * write: expo-secure-store updates an existing item's data and nothing else
 * (`update` in ios/SecureStoreModule.swift). Only deleting the item drops it.
 */
const write = (key: string, value: string, options?: Options) => {
  if (!values.has(key)) {
    // A spec can drop an item through `secureStoreValues`, which leaves what
    // it was created with behind. A new item never inherits it.
    accessibility.delete(key);
    if (options?.keychainAccessible !== undefined) {
      accessibility.set(key, options.keychainAccessible);
    }
  }
  values.set(key, value);
};

const remove = (key: string) => {
  values.delete(key);
  accessibility.delete(key);
};

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
  AFTER_FIRST_UNLOCK,
  getItem: (key: string) => read(key),
  setItem: (key: string, value: string, options?: Options) =>
    write(key, value, options),
  getItemAsync: async (key: string) => read(key),
  setItemAsync: async (key: string, value: string, options?: Options) =>
    write(key, value, options),
  deleteItemAsync: async (key: string) => remove(key),
};

/** Empties the store. Call it from `beforeEach` so tests stay isolated. */
export const clearSecureStore = () => {
  values.clear();
  accessibility.clear();
  locked = false;
};

/** What a spec needs to set up or read back the stored values directly. */
export const secureStoreValues = values;

/** Locks the phone, or unlocks it again with `false`. */
export const lockSecureStore = (isLocked = true) => {
  locked = isLocked;
};
