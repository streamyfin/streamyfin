/**
 * Guard for `patchedDependencies`: bun only applies a patch when its key
 * (`name@version`) matches the exact resolved version in bun.lock. When the
 * dependency is later bumped, bun silently skips the patch — the fix vanishes
 * with no error. A version-less key (`"name": ...`) is silently ignored too.
 * This check turns both silent failures into a loud CI error.
 */
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  patchedDependencies?: Record<string, string>;
};
const lockfile = readFileSync("bun.lock", "utf8");

const patchedDependencies = packageJson.patchedDependencies ?? {};
const errors: string[] = [];

for (const key of Object.keys(patchedDependencies)) {
  // Split on the LAST "@" so scoped names ("@expo/ui@57.0.7") parse correctly.
  const separatorIndex = key.lastIndexOf("@");
  if (separatorIndex <= 0) {
    errors.push(
      `"${key}": version-less patchedDependencies keys are silently ignored by bun — use "name@version".`,
    );
    continue;
  }
  const name = key.slice(0, separatorIndex);
  const version = key.slice(separatorIndex + 1);

  const escaped = `${name}@`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const resolvedVersions = [
    ...new Set(
      [...lockfile.matchAll(new RegExp(`"${escaped}(\\d[^"]*)"`, "g"))].map(
        (match) => match[1],
      ),
    ),
  ];

  if (!resolvedVersions.includes(version)) {
    errors.push(
      `"${key}": bun.lock resolves ${name} to ${resolvedVersions.join(", ") || "<not found>"} — ` +
        `the patch will be SILENTLY SKIPPED. Re-generate it: ` +
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
