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
// - Files the Expo config points to: the tvOS icons and Top Shelf images, the
//   fonts, the splash image and the notification icon passed as plugin
//   options, which the fingerprint hashes as text, and the adaptive icon's
//   monochrome image, which it leaves out.
// - The files config plugins copy in at prebuild, as the Android network
//   security config, and the custom EAS build steps in .eas/build.
// - The order of the config plugins: the fingerprint hashes the config as
//   sorted JSON, while the order decides what each mod sees. app.config.ts
//   adds plugins of its own, in an order of its own.
// - The build workflow, which sets native build options the project does not:
//   the Android ABIs, the Xcode and Java versions. A repack re-uploads the
//   binary it started from, so without this a changed option would never
//   reach the artifacts.
const { existsSync, readFileSync, statSync } = require("node:fs");

const { expo } = JSON.parse(readFileSync(`${__dirname}/app.json`, "utf8"));

const configFiles = () => {
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
  // Every path but the per-build extra section; a plugin entry is a name or
  // [name, options], and only the options hold files.
  const { extra: _extra, plugins = [], ...rest } = expo;
  walk(rest);
  for (const plugin of plugins) {
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
    {
      type: "dir",
      filePath: "scripts/ios",
      reasons: ["Native iOS and tvOS build scripts"],
    },
    {
      type: "file",
      filePath: ".github/workflows/build-apps.yml",
      reasons: ["Native build options set by the CI workflow"],
    },
    {
      type: "dir",
      filePath: "plugins",
      reasons: ["Files config plugins copy in at prebuild"],
    },
    {
      type: "dir",
      filePath: ".eas/build",
      reasons: ["Custom EAS build steps"],
    },
    {
      type: "contents",
      id: "configPluginOrder",
      contents: JSON.stringify(
        (expo.plugins ?? []).map((plugin) =>
          Array.isArray(plugin) ? plugin[0] : plugin,
        ),
      ),
      reasons: ["Order of the config plugins in app.json"],
    },
    {
      type: "file",
      filePath: "app.config.ts",
      reasons: ["Config plugins app.config.ts adds, in its order"],
    },
    // A path can name a folder, as the iOS 26 .icon bundle.
    ...configFiles().map((filePath) => ({
      type: statSync(`${__dirname}/${filePath}`).isDirectory() ? "dir" : "file",
      filePath,
      reasons: ["File the Expo config points to"],
    })),
  ],
};
