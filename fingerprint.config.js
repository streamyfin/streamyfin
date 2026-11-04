// Read by `@expo/fingerprint`, which CI uses to decide whether a PR needs a new
// native binary or can repack the JS into an earlier one with the same hash.
// The hash must change only when native code changes: `app.config.ts` writes
// the commit, run number and build time into `extra.build` on every build, so
// the extra section must never be hashed, or no two commits would ever match.
//
// The fingerprint also misses two kinds of native input, and each must still
// force a native build, or a repack would ship the old version of it:
// - `targets/`, the Swift sources of the app extensions (the download Live
//   Activity, the tvOS Top Shelf), which config plugins copy in at prebuild.
// - Files passed as config plugin options in `app.json`: the tvOS icons and
//   Top Shelf images, the fonts, the splash image, the notification icon. The
//   fingerprint hashes plugin options as text, not the files they point to.
const { existsSync, readFileSync } = require("node:fs");

const pluginOptionFiles = () => {
  const { expo } = JSON.parse(readFileSync(`${__dirname}/app.json`, "utf8"));
  const files = new Set();
  const walk = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("./") && existsSync(`${__dirname}/${value}`)) {
        files.add(value.slice(2));
      }
    } else if (value && typeof value === "object") {
      for (const child of Object.values(value)) walk(child);
    }
  };
  // Each plugin entry is a name or [name, options]; only the options hold assets.
  for (const plugin of expo.plugins ?? []) {
    if (Array.isArray(plugin)) walk(plugin.slice(1));
  }
  return [...files].sort();
};

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ["ExpoConfigExtraSection"],
  extraSources: [
    {
      type: "dir",
      filePath: "targets",
      reasons: ["App extension sources copied in by config plugins"],
    },
    ...pluginOptionFiles().map((filePath) => ({
      type: "file",
      filePath,
      reasons: ["File passed as a config plugin option in app.json"],
    })),
  ],
};
