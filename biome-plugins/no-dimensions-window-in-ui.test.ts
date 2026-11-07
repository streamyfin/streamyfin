import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

const DIMENSIONS_CASES = `const moduleSnapshot = Dimensions.get("window").width;
const singleQuoted = Dimensions.get('window').height;
const { width: destructured } = Dimensions.get("window");
const screen = Dimensions.get("screen").width;
const hooked = useWindowDimensions().width;
const Component = () => {
  const inside = Dimensions.get("window").width;
  return inside;
};
`;

const DIMENSIONS_FLAGGED = [1, 2, 3, 7];
const DIMENSIONS_ALLOWED = [4, 5];

const lintFile = (file: string, fileName: string): number[] => {
  const result = spawnSync(
    "bunx",
    ["biome", "lint", "--colors=off", "--max-diagnostics=100", file],
    { cwd: ROOT, encoding: "utf8" },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.error || !output.includes("Checked 1 file")) {
    throw new Error(
      `biome lint did not check the probe: ${result.error ?? output}`,
    );
  }
  const re = new RegExp(
    `${fileName.replace(".", "\\.")}:(\\d+):\\d+ plugin`,
    "g",
  );
  return [...output.matchAll(re)].map((m) => Number(m[1]));
};

const withProbe = (dir: string, content: string): number[] => {
  const tmp = fs.mkdtempSync(path.join(ROOT, dir, ".lint-probe-"));
  const file = path.join(tmp, "Probe.tsx");
  fs.writeFileSync(file, content);
  try {
    return lintFile(file, "Probe.tsx");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

describe("no-dimensions-window-in-ui", () => {
  const appLines = withProbe("app", DIMENSIONS_CASES);
  const tvLines = withProbe(
    "components/tv",
    `const styles = {\n  fontSize: 20,\n};\n`,
  );

  it.each(DIMENSIONS_FLAGGED)("flags line %i in app/**/*.tsx", (line) => {
    expect(appLines).toContain(line);
  });

  it.each(DIMENSIONS_ALLOWED)("allows line %i in app/**/*.tsx", (line) => {
    expect(appLines).not.toContain(line);
  });

  it("flags Dimensions.get('window') on TV paths too", () => {
    expect(withProbe("components/tv", DIMENSIONS_CASES)).toEqual(
      expect.arrayContaining(DIMENSIONS_FLAGGED),
    );
  });

  it("still flags hardcoded TV font sizes alongside it", () => {
    expect(tvLines).toContain(2);
  });

  it("allows the non-UI helper in hooks/useOrientation.ts", () => {
    expect(
      lintFile(path.join(ROOT, "hooks/useOrientation.ts"), "useOrientation.ts"),
    ).toEqual([]);
  });
});
