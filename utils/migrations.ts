import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";

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
