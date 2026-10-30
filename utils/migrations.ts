import { MAX_BITRATE_KEY } from "@/constants/Bitrate";
import { LOGS_STORAGE_KEY } from "@/constants/Logs";
import {
  LEGACY_SEERR_COOKIES_STORAGE_KEY,
  LEGACY_SEERR_USER_STORAGE_KEY,
  SEERR_COOKIES_STORAGE_KEY,
  SEERR_USER_STORAGE_KEY,
} from "@/constants/Seerr";
import { AUTO_BITRATE } from "@/utils/bitrate";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { redactStoredLog } from "@/utils/logStorage";
import { storage } from "@/utils/mmkv";
import {
  PLUGIN_APPLIED_DEFAULTS_KEY,
  SETTINGS_KEY,
} from "@/utils/storedSettings";

/**
 * One-off migrations for locally stored (MMKV) data.
 *
 * `storageSchemaVersion` records the highest migration this install has run.
 * On launch, every migration above that number runs once, in order. Fresh
 * installs are stamped at the latest version without running anything — there
 * is no legacy data to fix up.
 *
 * A migration that throws stops the run and leaves the version at the last
 * success, so the rest are retried on the next launch rather than skipped
 * over data an earlier one never prepared. Launch is never blocked either way.
 *
 * Adding one:
 *  - append an entry with the next version number. Never renumber, reorder or
 *    edit a released migration: users are already stamped past it and will
 *    never see the change.
 *  - keep `run` synchronous and idempotent. It runs before anything else in
 *    the app, and a later failure means it may run again on the next launch.
 */
const SCHEMA_VERSION_KEY = "storageSchemaVersion";

/** The slice of the MMKV surface migrations are allowed to touch. */
export interface MigrationStorage {
  getNumber: (key: string) => number | undefined;
  getString: (key: string) => string | undefined;
  getAllKeys: () => string[];
  set: (key: string, value: boolean | number | string) => void;
  remove: (key: string) => void;
}

interface Migration {
  /** Monotonically increasing; the store is stamped with the highest one. */
  version: number;
  /** Why it exists — surfaced in the app log when it runs. */
  description: string;
  run: (store: MigrationStorage) => void;
}

/**
 * A JSON object the app stored, or undefined. One that cannot be read is left
 * alone: the settings report it when they load it, where a failure here would
 * hold back every later migration.
 */
const readStoredObject = (
  store: MigrationStorage,
  key: string,
): Record<string, unknown> | undefined => {
  const stored = store.getString(key);
  if (stored === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(stored);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description:
      "clear hasShownIntro so existing users see the intro again, now that it carries the crash-reporting opt-out",
    run: (store) => {
      store.remove("hasShownIntro");
    },
  },
  // No 2: the log redaction was planned as 2 but reached develop after 3, so
  // it is 4. An install already stamped at 3 would never run a 2.
  {
    version: 3,
    description:
      "move the Seerr session from the keys it had when Seerr was called Jellyseerr",
    run: (store) => {
      for (const [legacy, current] of [
        [LEGACY_SEERR_USER_STORAGE_KEY, SEERR_USER_STORAGE_KEY],
        [LEGACY_SEERR_COOKIES_STORAGE_KEY, SEERR_COOKIES_STORAGE_KEY],
      ] as const) {
        const stored = store.getString(legacy);
        if (stored !== undefined && store.getString(current) === undefined) {
          store.set(current, stored);
        }
        store.remove(legacy);
      }
    },
  },
  {
    version: 4,
    description:
      "redact credentials from the app log, where the iOS player wrote access tokens inside subtitle URLs",
    run: (store) => {
      const stored = store.getString(LOGS_STORAGE_KEY);
      if (stored === undefined) return;
      const redacted = redactStoredLog(stored);
      if (redacted === undefined) {
        store.remove(LOGS_STORAGE_KEY);
      } else {
        store.set(LOGS_STORAGE_KEY, redacted);
      }
    },
  },
  {
    version: 5,
    description:
      "move the default quality from Max, the default until now, to Auto, the new one",
    run: (store) => {
      const settings = readStoredObject(store, SETTINGS_KEY);
      const quality = settings?.defaultBitrate as { key?: unknown } | undefined;
      // Saving any setting stored every default with it, so a Max on the
      // device cannot be told from one nobody picked: they all move.
      if (!settings || quality?.key !== MAX_BITRATE_KEY) return;
      // But for the Max a plugin default wrote there: that one is the server
      // admin's. A locked one is in the plugin's settings, which stay as they
      // are and win over these anyway.
      const seeded = readStoredObject(store, PLUGIN_APPLIED_DEFAULTS_KEY);
      if (JSON.stringify(seeded?.defaultBitrate) === JSON.stringify(quality)) {
        return;
      }
      settings.defaultBitrate = AUTO_BITRATE;
      store.set(SETTINGS_KEY, JSON.stringify(settings));
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
);

/**
 * A first launch after install: nothing has ever been written to the store.
 * Only trustworthy because `@/utils/bootstrap` runs this before any other app
 * module evaluates, so no key can have been written yet.
 */
const isFreshInstall = (store: MigrationStorage) =>
  store.getAllKeys().length === 0;

/**
 * Apply any pending storage migrations. Called once from `@/utils/bootstrap`,
 * which is the first module the app evaluates. Don't call it anywhere else.
 */
export function runStorageMigrations(store: MigrationStorage = storage): void {
  try {
    const applied = store.getNumber(SCHEMA_VERSION_KEY) ?? 0;
    if (applied >= LATEST_SCHEMA_VERSION) return;

    if (applied === 0 && isFreshInstall(store)) {
      store.set(SCHEMA_VERSION_KEY, LATEST_SCHEMA_VERSION);
      return;
    }

    const pending = MIGRATIONS.filter((m) => m.version > applied).sort(
      (a, b) => a.version - b.version,
    );

    let reached = applied;
    for (const migration of pending) {
      try {
        migration.run(store);
      } catch (error) {
        // Stop here rather than run the rest against data this one didn't
        // prepare. The version stays put, so a transient failure is retried
        // next launch, and the app starts normally either way.
        writeErrorLog(`Storage migration ${migration.version} failed`, error);
        break;
      }
      reached = migration.version;
      writeInfoLog(
        `Storage migration ${migration.version} applied: ${migration.description}`,
      );
    }

    if (reached > applied) store.set(SCHEMA_VERSION_KEY, reached);
  } catch (error) {
    writeErrorLog("Storage migrations could not run", error);
  }
}
