/**
 * Turns Reassure's `.reassure/output.json` into the PR comment.
 *
 * Reassure flags a duration change at 5% with no absolute floor, and puts a
 * 🔴 on every scenario with an initial or redundant update. On a shared CI
 * runner that is mostly noise: a 0.2 ms wobble on a 2 ms scenario reads as a
 * regression. Its thresholds are not configurable, so the comment is built
 * here from the JSON instead, and the full report stays in the job summary.
 *
 * A 🔴 here means a duration regression past both floors, or a render count
 * that went up.
 */
import { readFileSync, writeFileSync } from "node:fs";

/** A change under this many milliseconds is timer noise, whatever its percentage. */
export const MIN_DURATION_DIFF_MS = 1;
/** A change under this share of the baseline is within run to run variance. */
export const MIN_RELATIVE_DURATION_DIFF = 0.1;

interface Run {
  meanDuration: number;
  meanCount: number;
  issues?: { initialUpdateCount?: number; redundantUpdates?: number[] };
}

interface Entry {
  name: string;
  baseline?: Run;
  current?: Run;
  durationDiff: number;
  relativeDurationDiff: number;
  isDurationDiffSignificant: boolean;
  countDiff: number;
}

export interface ReassureOutput {
  metadata?: {
    current?: { branch?: string; commitHash?: string };
    baseline?: { branch?: string; commitHash?: string };
  };
  significant: Entry[];
  meaningless: Entry[];
  countChanged: Entry[];
  added: Entry[];
  removed: Entry[];
}

const isRealDurationChange = (entry: Entry) =>
  entry.isDurationDiffSignificant &&
  Math.abs(entry.durationDiff) >= MIN_DURATION_DIFF_MS &&
  Math.abs(entry.relativeDurationDiff) >= MIN_RELATIVE_DURATION_DIFF;

const fixed = (value: number) => value.toFixed(1);
const signed = (value: string, raw: number) => `${raw > 0 ? "+" : ""}${value}`;
const percent = (ratio: number) => signed(`${Math.round(ratio * 100)}%`, ratio);
const cell = (name: string) => name.replaceAll("|", "\\|");

const byRelativeChange = (a: Entry, b: Entry) =>
  Math.abs(b.relativeDurationDiff) - Math.abs(a.relativeDurationDiff);
const byCountChange = (a: Entry, b: Entry) =>
  Math.abs(b.countDiff) - Math.abs(a.countDiff);

const DURATION_HEADER = [
  "| Scenario | Before (ms) | After (ms) | Δ (ms) | Δ % |",
  "| --- | ---: | ---: | ---: | ---: |",
];
const COUNT_HEADER = [
  "| Scenario | Before | After | Δ |",
  "| --- | ---: | ---: | ---: |",
];
const SINGLE_HEADER = ["| Scenario | Duration (ms) |", "| --- | ---: |"];

const durationRow = (entry: Entry) =>
  `| ${cell(entry.name)} | ${fixed(entry.baseline?.meanDuration ?? 0)} | ${fixed(
    entry.current?.meanDuration ?? 0,
  )} | ${signed(fixed(entry.durationDiff), entry.durationDiff)} | ${percent(
    entry.relativeDurationDiff,
  )} |`;

const countRow = (entry: Entry) =>
  `| ${cell(entry.name)} | ${entry.baseline?.meanCount} | ${
    entry.current?.meanCount
  } | ${signed(String(entry.countDiff), entry.countDiff)} |`;

const section = (title: string, header: string[], rows: string[]) =>
  rows.length ? [`#### ${title}`, "", ...header, ...rows, ""] : [];

const sha = (run?: { commitHash?: string }) =>
  `\`${run?.commitHash?.slice(0, 7) ?? "unknown"}\``;

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export const buildReport = (output: ReassureOutput): string => {
  const real = output.significant.filter(isRealDurationChange);
  const regressions = real
    .filter((entry) => entry.durationDiff > 0)
    .sort(byRelativeChange);
  const improvements = real
    .filter((entry) => entry.durationDiff < 0)
    .sort(byRelativeChange);
  const countUp = output.countChanged
    .filter((entry) => entry.countDiff > 0)
    .sort(byCountChange);
  const countDown = output.countChanged
    .filter((entry) => entry.countDiff < 0)
    .sort(byCountChange);
  const noise =
    output.significant.length - real.length + output.meaningless.length;

  const findings = regressions.length + countUp.length;
  const verdict = findings
    ? `🔴 ${plural(findings, "regression")}`
    : "✅ No regressions";
  // Improvements need no action, so they stay folded away.
  const credits = improvements.length + countDown.length;

  return [
    `### 🐢 Performance: ${verdict}`,
    "",
    `${sha(output.metadata?.baseline)} → ${sha(output.metadata?.current)}`,
    "",
    ...section(
      "Duration regressions",
      DURATION_HEADER,
      regressions.map(durationRow),
    ),
    ...section("More renders", COUNT_HEADER, countUp.map(countRow)),
    ...section(
      "Added scenarios",
      SINGLE_HEADER,
      output.added.map(
        (entry) =>
          `| ${cell(entry.name)} | ${fixed(entry.current?.meanDuration ?? 0)} |`,
      ),
    ),
    ...section(
      "Removed scenarios",
      SINGLE_HEADER,
      output.removed.map(
        (entry) =>
          `| ${cell(entry.name)} | ${fixed(entry.baseline?.meanDuration ?? 0)} |`,
      ),
    ),
    ...(credits
      ? [
          `<details><summary>${plural(credits, "improvement")}</summary>`,
          "",
          ...section(
            "Duration improvements",
            DURATION_HEADER,
            improvements.map(durationRow),
          ),
          ...section("Fewer renders", COUNT_HEADER, countDown.map(countRow)),
          "</details>",
          "",
        ]
      : []),
    `${plural(noise, "scenario")} moved less than ${MIN_DURATION_DIFF_MS} ms or ${
      MIN_RELATIVE_DURATION_DIFF * 100
    }% (noise).`,
    "",
  ].join("\n");
};

if (require.main === module) {
  const [input = ".reassure/output.json", output = ".reassure/comment.md"] =
    process.argv.slice(2);
  writeFileSync(
    output,
    buildReport(JSON.parse(readFileSync(input, "utf8")) as ReassureOutput),
  );
}
