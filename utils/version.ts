import * as Application from "expo-application";
import Constants from "expo-constants";

/** Raw marketing version (app.json `version`), e.g. "0.54.1". Exposed so the Jellyfin
 * clientInfo auto-tracks the app version instead of a hardcoded string. */
export const APP_VERSION = Application.nativeApplicationVersion ?? "unknown";

/** Build metadata injected at build time by `app.config.js` into `extra.build`. */
export interface BuildMeta {
  commit?: string | null;
  branch?: string | null;
  profile?: string | null;
  runNumber?: string | null;
  builtAt?: string | null;
}

export interface VersionInfo {
  /** Marketing version (CFBundleShortVersionString / android versionName), e.g. "0.54.1". */
  version: string | null;
  /** Build number (CFBundleVersion / versionCode), e.g. "42". */
  build: string | null;
  /** Short git commit the build was made from, e.g. "a1b2c3d". */
  commit: string | null;
  /** Git branch the build was made from, e.g. "develop". */
  branch: string | null;
  /** EAS build profile, e.g. "production", "ci", "preview", or null for local. */
  profile: string | null;
  /** GitHub Actions run number the build came from, e.g. "2098". Null outside CI. */
  runNumber: string | null;
  isDev: boolean;
  isProduction: boolean;
  /** Graduated label for the Settings "App version" row (see tiering below). */
  display: string;
}

/**
 * Resolve a graduated version string for Settings.
 *
 * Tiering (most → least detailed):
 *  - dev / local build   → `version · branch · commit`     (full context for debugging)
 *  - develop / CI / preview → `version · commit · #run`     (pin the exact source; the
 *      Actions run number maps the build to its run — artifacts + logs — without
 *      Expo access)
 *  - production (store / TestFlight) → `version`             (build number intentionally
 *      not shown: TestFlight already displays it to testers, and the commit pins the
 *      binary better)
 */
export function getVersionInfo(): VersionInfo {
  // Read native/config values defensively — a version string must never crash Settings
  // (e.g. a dev build whose native expo-constants is out of sync with the JS).
  const read = <T>(fn: () => T): T | null => {
    try {
      return fn() ?? null;
    } catch {
      return null;
    }
  };

  const version = read(() => Application.nativeApplicationVersion);
  const build = read(() => Application.nativeBuildVersion);
  const meta = (read(() => Constants.expoConfig?.extra?.build) ??
    {}) as BuildMeta;
  const commit = meta.commit ?? null;
  const branch = meta.branch ?? null;
  const profile = meta.profile ?? null;
  const runNumber = meta.runNumber ?? null;
  const isDev = __DEV__ === true;
  const isProduction =
    typeof profile === "string" && profile.startsWith("production");

  let display: string;
  if (isDev) {
    display = [version ?? "dev", branch, commit].filter(Boolean).join(" · ");
  } else if (isProduction) {
    display = version ?? build ?? "N/A";
  } else {
    display =
      [version, commit, runNumber && `#${runNumber}`]
        .filter(Boolean)
        .join(" · ") || "N/A";
  }

  return {
    version,
    build,
    commit,
    branch,
    profile,
    runNumber,
    isDev,
    isProduction,
    display,
  };
}
