// Only so importing the module (which pulls in @/utils/mmkv) doesn't reach for
// the native store — the tests below drive an injected store, not this one.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// this spec's module under test actually calls.
const errors: string[] = [];
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: (message: string) => void errors.push(message),
  writeDebugLog: () => undefined,
  readFromLog: () => [],
}));

import { LATEST_SCHEMA_VERSION, runStorageMigrations } from "./migrations";

const data = new Map<string, boolean | number | string>();
const store = {
  getNumber: (key: string) => data.get(key) as number | undefined,
  getString: (key: string) => data.get(key) as string | undefined,
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

  test("redacts credentials the app log stored before redaction existed", () => {
    const token = "0123456789abcdef0123456789abcdef";
    data.set("storageSchemaVersion", 1);
    data.set(
      "logs",
      JSON.stringify([
        {
          timestamp: "2026-09-27T15:04:07.000Z",
          level: "INFO",
          message: `[native player] getSubtitleTracks: found sub track id=2, title=Stream.subrip?ApiKey=${token}, lang=none, external=true`,
        },
      ]),
    );

    runStorageMigrations(store);

    const stored = data.get("logs") as string;
    expect(stored).not.toContain(token);
    expect(JSON.parse(stored)[0].message).toContain(
      "title=Stream.subrip?ApiKey=[redacted]",
    );
    expect(version()).toBe(LATEST_SCHEMA_VERSION);
  });

  test("drops an app log it cannot read", () => {
    data.set("storageSchemaVersion", 1);
    data.set("logs", '[{"message":"?api_key=0123456789abcdef');

    runStorageMigrations(store);

    expect(data.has("logs")).toBe(false);
    expect(version()).toBe(LATEST_SCHEMA_VERSION);
  });

  // The redaction reached develop after the Seerr move took 3: an install
  // already stamped at 3 must still run it, which it would not as a 2.
  test("redacts the app log on an install already stamped at 3", () => {
    const token = "0123456789abcdef0123456789abcdef";
    data.set("storageSchemaVersion", 3);
    data.set(
      "logs",
      JSON.stringify([
        {
          timestamp: "2026-09-27T15:04:07.000Z",
          level: "INFO",
          message: `[native player] getSubtitleTracks: found sub track id=2, title=Stream.subrip?ApiKey=${token}, lang=none, external=true`,
        },
      ]),
    );

    runStorageMigrations(store);

    expect(data.get("logs")).not.toContain(token);
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

describe("the Seerr session", () => {
  // An install from before the rename, already past migration 1.
  beforeEach(() => {
    data.set("storageSchemaVersion", 1);
  });

  test("moves to the names it has now", () => {
    data.set("JELLYSEERR_USER", '{"id":7}');
    data.set("JELLYSEERR_COOKIES", '["connect.sid=s%3A1"]');

    runStorageMigrations(store);

    expect(data.get("SEERR_USER")).toBe('{"id":7}');
    expect(data.get("SEERR_COOKIES")).toBe('["connect.sid=s%3A1"]');
    expect(data.has("JELLYSEERR_USER")).toBe(false);
    expect(data.has("JELLYSEERR_COOKIES")).toBe(false);
  });

  // A device that already signed in under the new names keeps that session:
  // the old one is older by construction.
  test("keeps a session already under the new names", () => {
    data.set("SEERR_USER", '{"id":9}');
    data.set("JELLYSEERR_USER", '{"id":7}');

    runStorageMigrations(store);

    expect(data.get("SEERR_USER")).toBe('{"id":9}');
    expect(data.has("JELLYSEERR_USER")).toBe(false);
  });
});

describe("the default quality", () => {
  const settings = (stored: Record<string, unknown>) =>
    data.set("settings", JSON.stringify(stored));
  const storedQuality = () =>
    JSON.parse(data.get("settings") as string).defaultBitrate;

  // An install from before Auto, past every migration that came before it.
  beforeEach(() => {
    data.set("storageSchemaVersion", 4);
  });

  // Max was the default, and saving any setting stored the defaults with it:
  // a Max on the device cannot be told from one nobody picked.
  test("moves from Max, the old default, to Auto", () => {
    settings({ defaultBitrate: { key: "Max" }, forwardSkipTime: 15 });

    runStorageMigrations(store);

    expect(storedQuality()).toEqual({ key: "Auto" });
    expect(JSON.parse(data.get("settings") as string).forwardSkipTime).toBe(15);
    expect(version()).toBe(LATEST_SCHEMA_VERSION);
  });

  test("moves once: Max picked again afterwards stays Max", () => {
    settings({ defaultBitrate: { key: "Max" } });
    runStorageMigrations(store);

    settings({ defaultBitrate: { key: "Max" } });
    runStorageMigrations(store);

    expect(storedQuality()).toEqual({ key: "Max" });
  });

  test("keeps a fixed quality", () => {
    settings({ defaultBitrate: { key: "8 Mb/s", value: 8_000_000 } });

    runStorageMigrations(store);

    expect(storedQuality()).toEqual({ key: "8 Mb/s", value: 8_000_000 });
  });

  // An unlocked plugin default is written into the settings once. That Max is
  // the server admin's, not the old default.
  test("keeps a Max the server's plugin set", () => {
    settings({ defaultBitrate: { key: "Max" } });
    data.set(
      "STREAMYFIN_PLUGIN_APPLIED_DEFAULTS",
      JSON.stringify({ defaultBitrate: { key: "Max" } }),
    );

    runStorageMigrations(store);

    expect(storedQuality()).toEqual({ key: "Max" });
  });

  test("leaves the plugin's own settings as they are", () => {
    const locked = JSON.stringify({ defaultBitrate: { locked: true } });
    settings({ defaultBitrate: { key: "Max" } });
    data.set("STREAMYFIN_PLUGIN_SETTINGS", locked);

    runStorageMigrations(store);

    expect(data.get("STREAMYFIN_PLUGIN_SETTINGS")).toBe(locked);
  });

  test("leaves settings it cannot read for the settings to report", () => {
    data.set("settings", '{"defaultBitrate":');

    runStorageMigrations(store);

    expect(data.get("settings")).toBe('{"defaultBitrate":');
    expect(errors).toEqual([]);
    expect(version()).toBe(LATEST_SCHEMA_VERSION);
  });

  test("has nothing to move on a device without settings", () => {
    runStorageMigrations(store);

    expect(data.has("settings")).toBe(false);
    expect(version()).toBe(LATEST_SCHEMA_VERSION);
  });
});
