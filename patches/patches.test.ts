import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Expo ships most of its Android modules precompiled: an AAR in the package's
// local-maven-repo, which autolinking links instead of compiling the Kotlin
// sources. A patch to those sources then changes nothing in the app, with no
// error anywhere: the external player chooser shipped that way, its
// `chooserTitle` param silently dropped. Autolinking builds a package from
// source only when `expo.autolinking.android.buildFromSource` in package.json
// names it (each entry a regex over the Gradle project name).
//
// These tests pin it: every patch that touches a precompiled package's
// android/ sources must have that package built from source.

const root = join(__dirname, "..");

interface PackageJson {
  patchedDependencies?: Record<string, string>;
  expo?: {
    autolinking?: { android?: { buildFromSource?: string[] } };
  };
}

const packageJson: PackageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const buildFromSource = (
  packageJson.expo?.autolinking?.android?.buildFromSource ?? []
).map((pattern) => new RegExp(`^(?:${pattern})$`));

/** `name@version`, `@scope/name@version` or `name@github:...` to the name. */
const packageName = (dependency: string): string =>
  dependency.slice(0, dependency.indexOf("@", 1));

const patchesAndroidSources = (patchFile: string): boolean =>
  /^diff --git a\/android\//m.test(readFileSync(join(root, patchFile), "utf8"));

const isPrecompiledOnAndroid = (name: string): boolean => {
  const config = join(root, "node_modules", name, "expo-module.config.json");
  if (!existsSync(config)) return false;
  return !!JSON.parse(readFileSync(config, "utf8")).android?.publication;
};

const patchedAndroidModules = Object.entries(
  packageJson.patchedDependencies ?? {},
)
  .filter(([, patchFile]) => patchesAndroidSources(patchFile))
  .map(([dependency]) => packageName(dependency));

describe("patches to native Android sources", () => {
  // Guards the check below against a parse change that finds nothing.
  test("finds the patched Android modules", () => {
    expect(patchedAndroidModules.length).toBeGreaterThan(0);
  });

  test.each(patchedAndroidModules)(
    "%s is built from source when Expo ships it precompiled",
    (name) => {
      if (!isPrecompiledOnAndroid(name)) return;
      expect(buildFromSource.some((pattern) => pattern.test(name))).toBe(true);
    },
  );
});
