#!/usr/bin/env bun
/**
 * Populates the "Streamyfin Version" dropdown in the issue report form with the
 * latest GitHub releases. Run by the "Update Issue Form Versions" workflow on
 * release events + a weekly cron (and manually via workflow_dispatch).
 *
 * Source: GitHub releases, newest first, INCLUDING drafts and prereleases — those
 * are the builds release.yml pushes to TestFlight (iOS) / beta (Android), and the
 * app shows that same version to users. Draft releases are labelled "X (TestFlight)".
 * Non-version sentinels (e.g. "older") are preserved at the end of the list.
 *
 * Usage:
 *   bun scripts/update-issue-form.mjs            # rewrite the form in place
 *   ISSUE_FORM_LIMIT=8 bun scripts/update-issue-form.mjs
 *   bun scripts/update-issue-form.mjs --dry-run  # print the new options, don't write
 *
 * Env: GITHUB_REPOSITORY (owner/repo), GH_TOKEN/GITHUB_TOKEN (for gh, provided in CI).
 */

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  readFileSync as read,
  writeFileSync as write,
} from "node:fs";

const FORM = ".github/ISSUE_TEMPLATE/issue_report.yml";
const DROPDOWN_ID = "version"; // the `id:` of the dropdown to populate
const parsedLimit = Number.parseInt(process.env.ISSUE_FORM_LIMIT ?? "", 10);
const LIMIT =
  Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
const REPO = process.env.GITHUB_REPOSITORY || "streamyfin/streamyfin";
const DRY = process.argv.includes("--dry-run");

// Matches "0.54.1" and prerelease/beta tags like "0.54.0-beta.1".
const isVersion = (s) => /^\d+\.\d+/.test(s.trim());

// 1. Fetch releases (newest first) with their draft flag. Drafts are the builds pushed
//    to TestFlight (iOS) / beta (Android) by release.yml, so they aren't a full release
//    yet — we label those "X (TestFlight)". (Listing drafts needs the token to have repo
//    write access, which the workflow grants.)
const raw = execFileSync(
  "gh",
  [
    "api",
    `repos/${REPO}/releases`,
    "--paginate",
    "--jq",
    ".[] | [.tag_name, .draft] | @tsv",
  ],
  { encoding: "utf8" },
);
const seen = new Set();
const versions = [];
for (const line of raw.split("\n")) {
  const [tag, draft] = line.split("\t");
  if (!tag) continue;
  const ver = tag.trim().replace(/^v/, "");
  if (!isVersion(ver) || seen.has(ver)) continue;
  seen.add(ver);
  versions.push(draft === "true" ? `${ver} (TestFlight)` : ver);
  if (versions.length >= LIMIT) break;
}

if (!versions.length) {
  console.error("No release versions found — leaving the form untouched.");
  process.exit(1);
}

// 2. rewrite the dropdown options, preserving non-version sentinels (e.g. "older").
//    The old generic "TestFlight/Development build" entry is dropped — TestFlight
//    versions are now shown individually as "X (TestFlight)".
const lines = read(FORM, "utf8").split("\n");
const idIdx = lines.findIndex((l) =>
  l.match(new RegExp(`^\\s*id:\\s*${DROPDOWN_ID}\\s*$`)),
);
if (idIdx === -1)
  throw new Error(`dropdown id: ${DROPDOWN_ID} not found in ${FORM}`);
const optIdx = lines.findIndex(
  (l, i) => i > idIdx && /^\s*options:\s*$/.test(l),
);
if (optIdx === -1)
  throw new Error(`options: not found after id: ${DROPDOWN_ID}`);

const itemIndent = lines[optIdx].match(/^\s*/)[0] + "  "; // options items are nested one level deeper
let end = optIdx + 1;
const sentinels = [];
while (end < lines.length && /^\s*-\s+/.test(lines[end])) {
  const val = lines[end].replace(/^\s*-\s+/, "");
  if (!isVersion(val) && !/testflight/i.test(val)) sentinels.push(val);
  end++;
}

const newOptions = [...versions, ...sentinels].map(
  (v) => `${itemIndent}- ${v}`,
);
const updated = [
  ...lines.slice(0, optIdx + 1),
  ...newOptions,
  ...lines.slice(end),
].join("\n");

console.log(
  `Versions: ${versions.join(", ")}${sentinels.length ? ` | kept: ${sentinels.join(", ")}` : ""}`,
);
if (DRY) {
  console.log("--dry-run: not writing.");
} else {
  write(FORM, updated);
  console.log(`Updated ${FORM}.`);
}

// Expose the resulting list for the workflow (PR description).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `versions=${versions.join(", ")}\n`,
  );
}
