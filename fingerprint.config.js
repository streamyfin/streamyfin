// Read by `@expo/fingerprint`, which CI uses to decide whether a PR needs a new
// native binary or can repack the JS into an earlier one with the same hash.
// The hash must change only when native code changes: `app.config.ts` writes
// the commit, run number and build time into `extra.build` on every build, so
// the extra section must never be hashed, or no two commits would ever match.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ["ExpoConfigExtraSection"],
};
