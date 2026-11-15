import { pluginLines } from "./lintProbes";

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
// to apply.
const lintedLines = (properties: string[]): number[] =>
  pluginLines([
    {
      dir: "components/tv",
      name: "Probe.tsx",
      content: `export const a = {\n${properties.map((p) => `  ${p},`).join("\n")}\n};\n`,
    },
  ])["Probe.tsx"].map((line) => line - 1);

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
