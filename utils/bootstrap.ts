import { runStorageMigrations } from "@/utils/migrations";

/**
 * Imported for its side effect as the very first module in the app graph, so
 * migrations finish before anything else evaluates. Import evaluation is
 * hoisted: a call placed in a layout's module body already runs after every
 * module it imports, and some of those read MMKV while evaluating (e.g.
 * `utils/atoms/selectedTVServer.ts` hydrates an atom from storage). Those
 * would otherwise see pre-migration data for the whole session.
 */
runStorageMigrations();
