import { buildReport, type ReassureOutput } from "./reassure-report";

const entry = (
  name: string,
  baseline: number,
  current: number,
  overrides: Record<string, unknown> = {},
) => ({
  name,
  baseline: { meanDuration: baseline, meanCount: 7 },
  current: { meanDuration: current, meanCount: 7 },
  durationDiff: current - baseline,
  relativeDurationDiff: (current - baseline) / baseline,
  isDurationDiffSignificant: true,
  countDiff: 0,
  ...overrides,
});

const output = (overrides: Partial<ReassureOutput>): ReassureOutput => ({
  significant: [],
  meaningless: [],
  countChanged: [],
  added: [],
  removed: [],
  ...overrides,
});

describe("buildReport", () => {
  it("does not flag a sub millisecond wobble on a small scenario", () => {
    // Reassure shows this as +12.8% 🔴.
    const report = buildReport(
      output({ significant: [entry("TVUserCard", 2.6, 2.95)] }),
    );
    expect(report).not.toContain("🔴 ");
    expect(report).toContain("No regressions");
  });

  it("does not flag a few percent on a large noisy scenario", () => {
    // Reassure shows this as +5.4% 🔴, with a 6% run to run spread.
    const report = buildReport(
      output({ significant: [entry("Video Player Controls", 101, 106.4)] }),
    );
    expect(report).toContain("No regressions");
  });

  it("flags a regression past both floors", () => {
    const report = buildReport(
      output({ significant: [entry("LibraryPage", 100, 130)] }),
    );
    expect(report).toContain("1 regression");
    expect(report).toContain("LibraryPage");
  });

  it("flags more renders and credits fewer", () => {
    const report = buildReport(
      output({
        countChanged: [
          entry("Grew", 5, 5, { countDiff: 2 }),
          entry("Shrank", 5, 5, { countDiff: -3 }),
        ],
      }),
    );
    expect(report).toContain("1 regression");
    expect(report).toContain("Fewer renders");
  });

  it("keeps a real improvement and drops a negligible one", () => {
    const report = buildReport(
      output({
        significant: [entry("CardGrid", 170, 42), entry("CardRow", 7.6, 6.9)],
      }),
    );
    expect(report).toContain("CardGrid");
    expect(report).not.toContain("CardRow");
  });

  it("never prints a render issue", () => {
    const report = buildReport(
      output({
        meaningless: [
          entry("Card", 3, 3, {
            current: {
              meanDuration: 3,
              meanCount: 7,
              issues: { initialUpdateCount: 1, redundantUpdates: [2, 3] },
            },
          }),
        ],
      }),
    );
    expect(report).not.toMatch(/redundant|initial/i);
  });
});
