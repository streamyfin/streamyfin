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

const ms = (value: number) => `${value.toFixed(1)} ms`;
const signed = (value: number, suffix: string) =>
  `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
const cell = (name: string) => name.replaceAll("|", "\\|");

const durationRow = (entry: Entry, symbol: string) =>
  `| ${cell(entry.name)} | ${ms(entry.baseline?.meanDuration ?? 0)} → ${ms(
    entry.current?.meanDuration ?? 0,
  )} (${signed(entry.durationDiff, " ms")}, ${signed(
    entry.relativeDurationDiff * 100,
    "%",
  )}) ${symbol} |`;

const countRow = (entry: Entry, symbol: string) =>
  `| ${cell(entry.name)} | ${entry.baseline?.meanCount} → ${
    entry.current?.meanCount
  } (${signed(entry.countDiff, "")}) ${symbol} |`;

const section = (title: string, header: string, rows: string[]) =>
  rows.length ? [`## ${title}`, "", header, "| --- | --- |", ...rows, ""] : [];

const describe = (run?: { branch?: string; commitHash?: string }) =>
  run?.branch
    ? `${run.branch} (${run.commitHash?.slice(0, 8) ?? "unknown"})`
    : "unknown";

export const buildReport = (output: ReassureOutput): string => {
  const real = output.significant.filter(isRealDurationChange);
  const regressions = real.filter((entry) => entry.durationDiff > 0);
  const improvements = real.filter((entry) => entry.durationDiff < 0);
  const countUp = output.countChanged.filter((entry) => entry.countDiff > 0);
  const countDown = output.countChanged.filter((entry) => entry.countDiff < 0);
  const noise =
    output.significant.length - real.length + output.meaningless.length;

  const findings = regressions.length + countUp.length;
  const verdict = findings
    ? `🔴 ${findings} regression${findings === 1 ? "" : "s"}`
    : "✅ No regressions";

  return [
    "# Performance Comparison Report",
    "",
    `- **Current**: ${describe(output.metadata?.current)}`,
    `- **Baseline**: ${describe(output.metadata?.baseline)}`,
    `- **Result**: ${verdict}`,
    "",
    ...section(
      "Duration regressions",
      "| Scenario | Duration |",
      regressions.map((entry) => durationRow(entry, "🔴")),
    ),
    ...section(
      "More renders",
      "| Scenario | Renders |",
      countUp.map((entry) => countRow(entry, "🔴")),
    ),
    ...section(
      "Duration improvements",
      "| Scenario | Duration |",
      improvements.map((entry) => durationRow(entry, "🟢")),
    ),
    ...section(
      "Fewer renders",
      "| Scenario | Renders |",
      countDown.map((entry) => countRow(entry, "🟢")),
    ),
    ...section(
      "Added scenarios",
      "| Scenario | Duration |",
      output.added.map(
        (entry) =>
          `| ${cell(entry.name)} | ${ms(entry.current?.meanDuration ?? 0)} |`,
      ),
    ),
    ...section(
      "Removed scenarios",
      "| Scenario | Duration |",
      output.removed.map(
        (entry) =>
          `| ${cell(entry.name)} | ${ms(entry.baseline?.meanDuration ?? 0)} |`,
      ),
    ),
    `${noise} scenario${noise === 1 ? "" : "s"} changed by less than ${
      MIN_DURATION_DIFF_MS
    } ms or ${MIN_RELATIVE_DURATION_DIFF * 100}%, which is within noise. The full report is in the job summary.`,
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
