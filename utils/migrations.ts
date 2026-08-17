import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";

/**
 * One-off migrations for locally stored (MMKV) data.
 *
 * `storageSchemaVersion` records the highest migration this install has run.
 * On launch, every migration above that number runs once, in order, and the
 * version is bumped to the latest. Fresh installs are stamped at the latest
 * version without running anything — there is no legacy data to fix up.
 *
 * Adding one:
 *  - append an entry with the next version number. Never renumber, reorder or
 *    edit a released migration: users are already stamped past it and will
 *    never see the change.
 *  - keep `run` synchronous and idempotent. It runs before the providers
 *    mount, and a failure moves the version on anyway (see below), so it must
 *    never depend on being retried.
 */
const SCHEMA_VERSION_KEY = "storageSchemaVersion";

/** The slice of the MMKV surface migrations are allowed to touch. */
export interface MigrationStorage {
  getNumber: (key: string) => number | undefined;
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

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description:
      "clear hasShownIntro so existing users see the intro again, now that it carries the crash-reporting opt-out",
    run: (store) => {
      store.remove("hasShownIntro");
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
);

/** A first launch after install: nothing has ever been written to the store. */
const isFreshInstall = (store: MigrationStorage) =>
  store.getAllKeys().length === 0;

/**
 * Apply any pending storage migrations. Call once, as early as possible at
 * startup and before the providers read stored state.
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

    for (const migration of pending) {
      try {
        migration.run(store);
        writeInfoLog(
          `Storage migration ${migration.version} applied: ${migration.description}`,
        );
      } catch (error) {
        // Best effort: a broken migration must never block launch, and the
        // version still moves past it so it can't fail on every launch.
        writeErrorLog(`Storage migration ${migration.version} failed`, error);
      }
    }

    store.set(SCHEMA_VERSION_KEY, LATEST_SCHEMA_VERSION);
  } catch (error) {
    writeErrorLog("Storage migrations could not run", error);
  }
}
