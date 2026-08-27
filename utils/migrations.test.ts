// Only so importing the module (which pulls in @/utils/mmkv) doesn't reach for
// the native store — the tests below drive an injected store, not this one.
// Stub the MMKV surface the migration code touches.
jest.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => undefined,
    delete: () => undefined,
    remove: () => undefined,
  }),
  useMMKVString: () => [undefined, () => undefined],
}));
// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// this spec's module under test actually calls.
const errors: string[] = [];
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: (message: string) => void errors.push(message),
  writeDebugLog: () => undefined,
  readFromLog: () => [],
}));

import { LATEST_SCHEMA_VERSION, runStorageMigrations } from "./migrations";

const data = new Map<string, boolean | number | string>();
const store = {
  getNumber: (key: string) => data.get(key) as number | undefined,
  getAllKeys: () => [...data.keys()],
  set: (key: string, value: boolean | number | string) =>
    void data.set(key, value),
  remove: (key: string) => void data.delete(key),
};

const version = () => data.get("storageSchemaVersion");

beforeEach(() => {
  data.clear();
  errors.length = 0;
});

describe("runStorageMigrations", () => {
  test("stamps a fresh install without running migrations", () => {
    runStorageMigrations(store);

    expect(version()).toBe(LATEST_SCHEMA_VERSION);
    expect([...data.keys()]).toEqual(["storageSchemaVersion"]);
  });

  test("clears hasShownIntro for an existing install", () => {
    data.set("token", "abc");
    data.set("hasShownIntro", true);

    runStorageMigrations(store);

    expect(data.has("hasShownIntro")).toBe(false);
    expect(data.get("token")).toBe("abc");
    expect(version()).toBe(LATEST_SCHEMA_VERSION);
  });

  test("logs a migration that throws and leaves it pending", () => {
    data.set("token", "abc");
    const failing = {
      ...store,
      remove: () => {
        throw new Error("remove failed");
      },
    };

    runStorageMigrations(failing);

    expect(errors[0]).toBe("Storage migration 1 failed");
    expect(version()).toBeUndefined();

    // It retries on the next launch, against a store that works again.
    runStorageMigrations(store);

    expect(version()).toBe(LATEST_SCHEMA_VERSION);
  });

  test("does not re-run once the store is up to date", () => {
    data.set("storageSchemaVersion", LATEST_SCHEMA_VERSION);
    data.set("hasShownIntro", true);

    runStorageMigrations(store);

    // The intro was dismissed after migrating, so it must stay dismissed.
    expect(data.get("hasShownIntro")).toBe(true);
  });
});
