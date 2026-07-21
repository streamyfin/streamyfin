/**
 * Guard for `patchedDependencies`: bun only applies a patch when its key
 * (`name@version`) matches the exact resolved version in bun.lock. When the
 * dependency is later bumped, bun silently skips the patch — the fix vanishes
 * with no error. A version-less key (`"name": ...`) is silently ignored too.
 * This check turns both silent failures into a loud CI error.
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  patchedDependencies?: Record<string, string>;
};
const lock = readFileSync("bun.lock", "utf8");

const patched = pkg.patchedDependencies ?? {};
const errors: string[] = [];

for (const key of Object.keys(patched)) {
  // Split on the LAST "@" so scoped names ("@expo/ui@57.0.7") parse correctly.
  const at = key.lastIndexOf("@");
  if (at <= 0) {
    errors.push(
      `"${key}": version-less patchedDependencies keys are silently ignored by bun — use "name@version".`,
    );
    continue;
  }
  const name = key.slice(0, at);
  const version = key.slice(at + 1);

  const escaped = `${name}@`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const resolved = [
    ...new Set(
      [...lock.matchAll(new RegExp(`"${escaped}(\\d[^"]*)"`, "g"))].map(
        (m) => m[1],
      ),
    ),
  ];

  if (!resolved.includes(version)) {
    errors.push(
      `"${key}": bun.lock resolves ${name} to ${resolved.join(", ") || "<not found>"} — ` +
        `the patch will be SILENTLY SKIPPED. Re-generate it: ` +
        `\`bun patch ${name}\`, re-apply ${patched[key]}, then \`bun patch --commit 'node_modules/${name}'\`, ` +
        `and update the patchedDependencies key.`,
    );
  }
}

if (errors.length > 0) {
  console.error("🚨 patchedDependencies drift detected:\n");
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log(
  `✅ patchedDependencies keys match resolved versions (${Object.keys(patched).length} patch(es) checked)`,
);
