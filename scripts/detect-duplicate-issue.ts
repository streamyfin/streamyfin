#!/usr/bin/env bun
/**
 * Flags likely-duplicate issues when a new issue is opened, using lexical similarity
 * (Jaccard over word sets of the title and body) — no API key, no embeddings.
 *
 * On a match it posts ONE comment listing the closest open issues and adds the
 * "possible duplicate" label. If nothing is similar enough, it does nothing.
 *
 * Env:
 *   GITHUB_REPOSITORY   owner/repo
 *   ISSUE_NUMBER        the new issue number
 *   ISSUE_TITLE         the new issue title
 *   ISSUE_BODY          the new issue body
 *   GH_TOKEN/GITHUB_TOKEN  for gh (provided in CI)
 *   DUP_THRESHOLD       similarity threshold 0..1 (default 0.3)
 *   DUP_MAX             max matches to report (default 5)
 *   DUP_FIXTURE         optional path to a JSON array of {number,title,body} (local testing)
 *   DRY_RUN             if set, print results instead of commenting/labelling
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface Issue {
  number: number;
  title: string;
  body: string | null;
}

// Parse a numeric env var, falling back to `def` only when unset/empty/NaN so an explicit 0 is honoured.
const numEnv = (name: string, def: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  return Number.isNaN(n) ? def : n;
};

const REPO = process.env.GITHUB_REPOSITORY || "streamyfin/streamyfin";
const NUMBER = numEnv("ISSUE_NUMBER", Number.NaN);
const TITLE = process.env.ISSUE_TITLE || "";
const BODY = process.env.ISSUE_BODY || "";
const THRESHOLD = numEnv("DUP_THRESHOLD", 0.3);
const MAX = numEnv("DUP_MAX", 5);
const DRY = !!process.env.DRY_RUN;
const LABEL = "🔁 duplicate";
const MARKER = "<!-- duplicate-detector -->";

// Generic stop words only — keep domain/feature/platform words (android, downloads,
// subtitles…) since those are exactly what makes two reports the same or different.
const STOP = new Set(
  (
    "a an the and or but if then of to in on at by for with from as is are was were be been being do does did " +
    "it its this that these those i you we they me my your our their he she him her " +
    "when while where what which who how why so just then than too very can could would should will " +
    "not no nor only own same s t don dont im ive please thanks hi hello also still get got use used using " +
    "app application streamyfin issue bug"
  ).split(/\s+/),
);

const stem = (w: string): string => w.replace(/(ing|ed|es|s)$/, "");

const tokens = (s: string | null): string[] =>
  (s || "")
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ") // drop code blocks
    .replace(/<!--[\s\S]*?-->/g, " ") // drop html comments
    .replace(/https?:\/\/\S+/g, " ") // drop urls
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 2);

const jaccard = (a: string[], b: string[]): number => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

const newTitle = tokens(TITLE);
const newBody = tokens(BODY);
const score = (o: Issue): number =>
  0.6 * jaccard(newTitle, tokens(o.title)) +
  0.4 * jaccard(newBody, tokens(o.body));

// fetch open issues (excluding PRs and the new issue itself)
let issues: Issue[];
if (process.env.DUP_FIXTURE) {
  issues = JSON.parse(readFileSync(process.env.DUP_FIXTURE, "utf8")) as Issue[];
} else {
  const raw = execFileSync(
    "gh",
    [
      "api",
      `repos/${REPO}/issues`,
      "--paginate",
      "-X",
      "GET",
      "-f",
      "state=open",
      "-f",
      "per_page=100",
      "--jq",
      ".[] | select(.pull_request | not) | {number, title, body}",
    ],
    { encoding: "utf8", maxBuffer: 1e8 },
  );
  issues = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Issue);
}

const matches = issues
  .filter((o) => o.number !== NUMBER)
  .map((o) => ({ ...o, s: score(o) }))
  .filter((o) => o.s >= THRESHOLD)
  .sort((a, b) => b.s - a.s)
  .slice(0, MAX);

if (!matches.length) {
  console.log("No likely duplicates found.");
  process.exit(0);
}

// Neutralise other issues' titles before echoing them back: break @mentions and
// strip markdown/HTML control chars so a maliciously-named issue can't ping people
// or inject formatting into our comment. GitHub linkifies "#123" on its own.
const safeTitle = (t: string): string =>
  (t || "")
    .replace(/@/g, "@​")
    .replace(/[`<>|*_~[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
const list = matches
  .map(
    (m) =>
      `- #${m.number} — ${safeTitle(m.title)} (≈ ${Math.round(m.s * 100)}% similar)`,
  )
  .join("\n");
const comment = [
  MARKER,
  "🔍 **This looks like it might be a duplicate.** Possibly related open issues:",
  "",
  list,
  "",
  "If yours is different, ignore this — a maintainer will confirm. Otherwise, please 👍 the existing issue and add any extra details there.",
].join("\n");

console.log(`Found ${matches.length} possible duplicate(s):\n${list}`);

if (DRY) {
  console.log("\nDRY_RUN: not commenting/labelling.");
  process.exit(0);
}

// Live mode needs a real issue number; refuse rather than POST to /issues/NaN/...
if (!Number.isInteger(NUMBER) || NUMBER <= 0) {
  console.error(
    `Invalid ISSUE_NUMBER ${JSON.stringify(process.env.ISSUE_NUMBER)} — refusing to comment.`,
  );
  process.exit(1);
}

// Idempotency: skip if we've already flagged this issue (guards re-runs / future triggers).
const priorComments = execFileSync(
  "gh",
  [
    "api",
    `repos/${REPO}/issues/${NUMBER}/comments`,
    "--paginate",
    "--jq",
    ".[].body",
  ],
  { encoding: "utf8", maxBuffer: 1e8 },
);
if (priorComments.includes(MARKER)) {
  console.log("Already flagged (marker present); skipping.");
  process.exit(0);
}

execFileSync(
  "gh",
  [
    "api",
    "-X",
    "POST",
    `repos/${REPO}/issues/${NUMBER}/comments`,
    "-f",
    `body=${comment}`,
  ],
  { stdio: "ignore" },
);
try {
  execFileSync(
    "gh",
    [
      "api",
      "-X",
      "POST",
      `repos/${REPO}/issues/${NUMBER}/labels`,
      "-f",
      `labels[]=${LABEL}`,
    ],
    { stdio: "ignore" },
  );
} catch {
  // label may not exist yet — create then add
  execFileSync(
    "gh",
    [
      "api",
      "-X",
      "POST",
      `repos/${REPO}/labels`,
      "-f",
      `name=${LABEL}`,
      "-f",
      "color=fbca04",
      "-f",
      "description=Automatically flagged as a possible duplicate",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "gh",
    [
      "api",
      "-X",
      "POST",
      `repos/${REPO}/issues/${NUMBER}/labels`,
      "-f",
      `labels[]=${LABEL}`,
    ],
    { stdio: "ignore" },
  );
}
console.log("Commented and labelled.");
