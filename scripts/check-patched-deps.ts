/**
 * Guard for `patchedDependencies`: bun only applies a patch when its key
 * (`name@version`) matches the exact resolved version in bun.lock. When the
 * dependency is later bumped, bun silently skips the patch and the fix
 * vanishes with no error. A version-less key (`"name": ...`) is ignored too.
 * This check turns both silent failures into a loud CI error.
 */
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  patchedDependencies?: Record<string, string>;
};

// This script runs under bun (CI pins >= 1.3.6, where Bun.JSONC landed).
// Declared locally because the project tsconfig loads node types, not bun's.
declare const Bun: { JSONC: { parse: (text: string) => unknown } };

const parseLockfile = (): { packages?: Record<string, unknown> } => {
  // bun.lock is JSONC (trailing commas, comments allowed); Bun.JSONC is the
  // same parser bun itself reads the lockfile with. Failing loudly here is
  // intentional: a guard that cannot read the lockfile must not pass.
  try {
    return Bun.JSONC.parse(readFileSync("bun.lock", "utf8")) as {
      packages?: Record<string, unknown>;
    };
  } catch (error) {
    console.error(
      "🚨 Failed to parse bun.lock - has its format changed?",
      error,
    );
    process.exit(1);
  }
};

// Collect versions from the package-resolution tuples ("name@version" as the
// first tuple element) rather than text-searching the whole lockfile: bun.lock
// also echoes package.json's patchedDependencies block, so a plain text scan
// would match a stale key against its own copy and hide the drift.
const resolvedVersions = new Map<string, Set<string>>();
for (const entry of Object.values(parseLockfile().packages ?? {})) {
  const resolution = Array.isArray(entry) ? entry[0] : undefined;
  if (typeof resolution !== "string") continue;
  // Split on the LAST "@" so scoped names ("@expo/ui@57.0.7") parse correctly.
  const separatorIndex = resolution.lastIndexOf("@");
  if (separatorIndex <= 0) continue;
  const name = resolution.slice(0, separatorIndex);
  const version = resolution.slice(separatorIndex + 1);
  const versions = resolvedVersions.get(name) ?? new Set<string>();
  versions.add(version);
  resolvedVersions.set(name, versions);
}

const patchedDependencies = packageJson.patchedDependencies ?? {};
const errors: string[] = [];

for (const key of Object.keys(patchedDependencies)) {
  const separatorIndex = key.lastIndexOf("@");
  if (separatorIndex <= 0) {
    errors.push(
      `"${key}": version-less patchedDependencies keys are silently ignored by bun, use "name@version".`,
    );
    continue;
  }
  const name = key.slice(0, separatorIndex);
  const version = key.slice(separatorIndex + 1);

  const versions = [...(resolvedVersions.get(name) ?? [])];
  if (!versions.includes(version)) {
    errors.push(
      `"${key}": bun.lock resolves ${name} to ${versions.join(", ") || "<not found>"}, ` +
        `so the patch will be silently skipped. Re-generate it: ` +
        `\`bun patch ${name}\`, re-apply ${patchedDependencies[key]}, then \`bun patch --commit 'node_modules/${name}'\`, ` +
        `and update the patchedDependencies key.`,
    );
  }
}

if (errors.length > 0) {
  console.error("🚨 patchedDependencies drift detected:\n");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log(
  `✅ patchedDependencies keys match resolved versions (${Object.keys(patchedDependencies).length} patch(es) checked)`,
);
