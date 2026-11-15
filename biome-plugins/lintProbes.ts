import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

export type LintProbe = {
  /** The repo folder the probe goes under, which decides the overrides. */
  dir: string;
  /** The probe's file name. The output is matched on it, so names differ. */
  name: string;
  content: string;
};

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Lints the probes and the repo files in `existing` in one Biome run, and
 * returns the lines a plugin flagged, by file name. Each probe is written for
 * the run to a temporary folder under its `dir`, where the biome.json overrides
 * that wire the plugins apply: a lint of stdin runs no plugin.
 */
export const pluginLines = (
  probes: LintProbe[],
  existing: string[] = [],
): Record<string, number[]> => {
  const folders: string[] = [];
  try {
    const files = probes.map((probe) => {
      const folder = fs.mkdtempSync(path.join(ROOT, probe.dir, ".lint-probe-"));
      folders.push(folder);
      const file = path.join(folder, probe.name);
      fs.writeFileSync(file, probe.content);
      return file;
    });
    const targets = [
      ...files,
      ...existing.map((file) => path.join(ROOT, file)),
    ];
    const result = spawnSync(
      "bunx",
      ["biome", "lint", "--colors=off", "--max-diagnostics=500", ...targets],
      { cwd: ROOT, encoding: "utf8" },
    );
    const output = `${result.stdout}${result.stderr}`;
    // A Biome that never ran reports nothing, which every allowed case would
    // take as a pass.
    if (result.error || !output.includes(`Checked ${targets.length} file`)) {
      throw new Error(
        `biome lint did not check the probes: ${result.error ?? output}`,
      );
    }
    const names = [
      ...probes.map((probe) => probe.name),
      ...existing.map((file) => path.basename(file)),
    ];
    return Object.fromEntries(
      names.map((name) => [
        name,
        [
          ...output.matchAll(
            new RegExp(`[\\\\/]${escapeRegExp(name)}:(\\d+):\\d+ plugin`, "g"),
          ),
        ]
          .map((match) => Number(match[1]))
          // Biome prints the diagnostics in no set order.
          .sort((a, b) => a - b),
      ]),
    );
  } finally {
    for (const folder of folders) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
};
