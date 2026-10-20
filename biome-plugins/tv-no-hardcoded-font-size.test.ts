import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

const FLAGGED = [
  "fontSize: 20",
  "fontSize: 20.5",
  "fontSize: -20",
  "fontSize: +20",
  "fontSize: 1_0",
  "fontSize: 20 * 2",
  "fontSize: scaleSize(20)",
  '"fontSize": 20',
  "'fontSize': scaleSize(20)",
];

const ALLOWED = [
  "fontSize: typography.body",
  "fontSize: typography.body * 2",
  "fontSize: typography.body + 2",
  "lineHeight: 20",
];

// One property per line, so a diagnostic's line number names its case. The probe
// sits under components/tv/ for the biome.json override that wires the plugin up
// to apply; a stdin lint does not run plugins.
const lintedLines = (properties: string[]): number[] => {
  const dir = fs.mkdtempSync(path.join(ROOT, "components/tv/.lint-probe-"));
  const file = path.join(dir, "Probe.tsx");
  fs.writeFileSync(
    file,
    `export const a = {\n${properties.map((p) => `  ${p},`).join("\n")}\n};\n`,
  );
  try {
    const result = spawnSync(
      "bunx",
      ["biome", "lint", "--colors=off", "--max-diagnostics=100", file],
      { cwd: ROOT, encoding: "utf8" },
    );
    const output = `${result.stdout}${result.stderr}`;
    // A Biome that never ran reports nothing, which every allowed case would
    // take as a pass.
    if (result.error || !output.includes("Checked 1 file")) {
      throw new Error(
        `biome lint did not check the probe: ${result.error ?? output}`,
      );
    }
    return [...output.matchAll(/Probe\.tsx:(\d+):\d+ plugin/g)].map(
      (m) => Number(m[1]) - 1,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("tv-no-hardcoded-font-size", () => {
  const all = [...FLAGGED, ...ALLOWED];
  const lines = lintedLines(all);

  it.each(FLAGGED)("flags %s", (property) => {
    expect(lines).toContain(all.indexOf(property) + 1);
  });

  it.each(ALLOWED)("allows %s", (property) => {
    expect(lines).not.toContain(all.indexOf(property) + 1);
  });
});
