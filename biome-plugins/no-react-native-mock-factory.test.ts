import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

const FLAGGED = [
  'jest.mock("react-native", () => ({ Platform: { isTV: true } }));',
  'jest.doMock("react-native", () => ({}));',
  "jest.mock('react-native', () => ({}));",
];

const ALLOWED = [
  'jest.mock("react-native-svg", () => ({}));',
  'jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({}));',
  'jest.unmock("react-native");',
  'requireOnPlatform({ isTV: true }, () => require("./Seerr"));',
];

// One statement per line, so a diagnostic's line number names its case. The
// probe is named like a spec for the biome.json override that wires the plugin
// up to apply; a stdin lint does not run plugins.
const lintedLines = (statements: string[]): number[] => {
  const dir = fs.mkdtempSync(path.join(ROOT, ".lint-probe-"));
  const file = path.join(dir, "probe.test.ts");
  fs.writeFileSync(file, `${statements.join("\n")}\n`);
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
    return [...output.matchAll(/probe\.test\.ts:(\d+):\d+ plugin/g)].map(
      (m) => Number(m[1]) - 1,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("no-react-native-mock-factory", () => {
  const all = [...FLAGGED, ...ALLOWED];
  const lines = lintedLines(all);

  test.each(FLAGGED)("flags %s", (statement) => {
    expect(lines).toContain(all.indexOf(statement));
  });

  test.each(ALLOWED)("allows %s", (statement) => {
    expect(lines).not.toContain(all.indexOf(statement));
  });
});
