#!/usr/bin/env bun
/**
 * Markdown report of the current Reassure measurements, for a PR whose base
 * has no Reassure setup yet and so nothing to compare against. Reassure writes
 * its own report only when it has a baseline.
 *
 * Usage:
 *   bun scripts/perf/currentReport.ts > .reassure/output.md
 */

import { readFileSync } from "node:fs";

type Entry = {
  name: string;
  type: "render" | "function";
  meanDuration: number;
  meanCount: number;
};

// The first line describes the run; each line after it is one scenario.
const entries = readFileSync(".reassure/current.perf", "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => JSON.parse(line) as Entry);

console.log("# Performance Measurements\n");
console.log(
  "The base branch has no Reassure setup, so there is nothing to compare against. These are the PR's own numbers.\n",
);
console.log("| Name | Type | Duration | Count |");
console.log("| --- | --- | --- | --- |");
for (const entry of entries) {
  console.log(
    `| ${entry.name} | ${entry.type} | ${entry.meanDuration.toFixed(1)} ms | ${entry.meanCount} |`,
  );
}
