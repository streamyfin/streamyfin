#!/usr/bin/env bun
/**
 * When a PR is merged into `develop`, reads the `## 🏷️ Ticket / Issue` section of
 * the PR template and closes every issue listed there, leaving a comment telling
 * the reporter to test on `develop` or wait for the next release.
 *
 * Why parse that section instead of grepping the whole body:
 *   - The template ships with `<!-- Example: Fixes #123 -->` inside it. We strip
 *     HTML comments first so a leftover example can't close a bogus issue.
 *   - Listing an issue in the Ticket/Issue area is itself the signal that this PR
 *     addresses it — we don't also require `fixes`/`closes` keywords.
 *
 * Recognised references (in THIS repo): `#123`, `org/repo#123`, and full issue
 * URLs. Cross-repo references are ignored so a link to another project can't close
 * the wrong-numbered issue here.
 *
 * Idempotent: a marker comment prevents double-posting on re-runs. Only acts on
 * real *issues* (never referenced PRs) and only those still open.
 *
 * Env:
 *   GITHUB_REPOSITORY  owner/repo
 *   PR_NUMBER          the merged PR number
 *   PR_TITLE           the merged PR title
 *   PR_BODY            the merged PR body (description)
 *   PR_URL             the merged PR html_url
 *   GH_TOKEN/GITHUB_TOKEN  for gh (provided in CI)
 *   DRY_RUN            if set, print what would happen instead of commenting/closing
 */

import { execFileSync } from "node:child_process";

const REPO = process.env.GITHUB_REPOSITORY || "streamyfin/streamyfin";
const PR_NUMBER = Number(process.env.PR_NUMBER || Number.NaN);
const PR_TITLE = process.env.PR_TITLE || "";
const PR_BODY = process.env.PR_BODY || "";
const PR_URL = process.env.PR_URL || "";
const DRY = !!process.env.DRY_RUN;
const MARKER = "<!-- close-referenced-issues -->";

if (!Number.isInteger(PR_NUMBER) || PR_NUMBER <= 0) {
  console.error(
    `Invalid PR_NUMBER ${JSON.stringify(process.env.PR_NUMBER)} — aborting.`,
  );
  process.exit(1);
}

// Pull the body of the `## 🏷️ Ticket / Issue` section: everything after the
// matching heading line up to the next markdown heading of any level.
const extractTicketSection = (body: string): string => {
  const lines = body.split(/\r?\n/);
  const isTicketHeading = (line: string): boolean =>
    /^#{1,6}\s+.*ticket\s*[/／]\s*issue/i.test(line);

  let i = 0;
  while (i < lines.length && !isTicketHeading(lines[i])) i++;
  i++; // skip the heading line itself
  const out: string[] = [];
  while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) {
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
};

// Drop HTML comments (kills the template's `Example: Fixes #123`), then isolate
// the Ticket/Issue section.
const cleanedBody = PR_BODY.replace(/<!--[\s\S]*?-->/g, " ");
const section = extractTicketSection(cleanedBody);

if (!section.trim()) {
  console.log(
    "No `Ticket / Issue` section found in the PR body — nothing to do.",
  );
  process.exit(0);
}

// References, pinned to THIS repo. Three capture shapes:
//   1. #123                                  -> group 1
//   2. https://github.com/<this>/issues/123  -> group 2
//   3. <this>#123                            -> group 3
// The bare `#N` branch carries a negative lookbehind so it doesn't swallow the
// `#N` tail of a cross-repo `other/repo#N` (those should never resolve here).
const escapedRepo = REPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REF = new RegExp(
  String.raw`(?:(?<![\w/.-])#(\d+)|https?://(?:www\.)?github\.com/${escapedRepo}/issues/(\d+)|${escapedRepo}#(\d+))`,
  "gi",
);

const candidates = new Set<number>();
for (const m of section.matchAll(REF)) {
  const n = Number(m[1] ?? m[2] ?? m[3]);
  if (Number.isInteger(n) && n > 0) candidates.add(n);
}

if (!candidates.size) {
  console.log(
    "No issue references in the `Ticket / Issue` section — nothing to do.",
  );
  process.exit(0);
}

console.log(
  `Referenced issue(s) in Ticket/Issue section: ${[...candidates].sort((a, b) => a - b).join(", ")}`,
);

// Neutralise the PR title before echoing it into our comment: break @mentions and
// strip markdown control chars so a hostile PR title can't ping people or inject
// formatting. GitHub linkifies "#123" / the PR url on its own.
const safeTitle = (t: string): string =>
  (t || "")
    .replace(/@/g, "@​")
    .replace(/[`<>|*_~[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

const prLink = PR_URL
  ? `#${PR_NUMBER} — [${PR_URL}](${PR_URL})`
  : `#${PR_NUMBER}`;
const titleSuffix = safeTitle(PR_TITLE) ? ` **${safeTitle(PR_TITLE)}**` : "";

const comment = [
  MARKER,
  `✅ A fix for this has been merged into [\`develop\`](https://github.com/${REPO}/tree/develop) — see ${prLink}.${titleSuffix}`,
  "",
  "You can test it now by running a build from `develop`, or wait for it to land in the next release.",
  "",
  "Closing this as fixed. If you can still reproduce it on `develop` or after the next release, please reopen with details. 🙏",
].join("\n");

let closed = 0;
let commented = 0;
let skipped = 0;

for (const number of candidates) {
  // Look up the referenced number — skip non-existent numbers and PRs (PRs are
  // "issues" in the REST API but expose a `pull_request` field).
  let issue: { state?: string; pull_request?: unknown } | null = null;
  try {
    const raw = execFileSync(
      "gh",
      [
        "api",
        `repos/${REPO}/issues/${number}`,
        "--jq",
        "{state, pull_request}",
      ],
      { encoding: "utf8" },
    );
    issue = JSON.parse(raw);
  } catch {
    console.log(`#${number}: not found / not accessible — skipping.`);
    skipped++;
    continue;
  }

  if (issue?.pull_request) {
    console.log(`#${number}: is a pull request, not an issue — skipping.`);
    skipped++;
    continue;
  }

  if (DRY) {
    console.log(
      `#${number}: DRY_RUN — would comment${issue?.state === "closed" ? " (already closed)" : " & close"}.`,
    );
    continue;
  }

  // Idempotency: don't double-comment on re-runs.
  const prior = execFileSync(
    "gh",
    [
      "api",
      `repos/${REPO}/issues/${number}/comments`,
      "--paginate",
      "--jq",
      ".[].body",
    ],
    { encoding: "utf8", maxBuffer: 1e8 },
  );
  if (!prior.includes(MARKER)) {
    execFileSync(
      "gh",
      [
        "api",
        "-X",
        "POST",
        `repos/${REPO}/issues/${number}/comments`,
        "-f",
        `body=${comment}`,
      ],
      { stdio: "ignore" },
    );
    commented++;
    console.log(`#${number}: commented.`);
  }

  if (issue?.state !== "closed") {
    try {
      execFileSync(
        "gh",
        [
          "issue",
          "close",
          String(number),
          "--repo",
          REPO,
          "--reason",
          "completed",
        ],
        { stdio: "ignore" },
      );
    } catch {
      // Fall back to the REST API if `gh issue close` is unavailable / errors.
      execFileSync(
        "gh",
        [
          "api",
          "-X",
          "PATCH",
          `repos/${REPO}/issues/${number}`,
          "-f",
          "state=closed",
        ],
        { stdio: "ignore" },
      );
    }
    closed++;
    console.log(`#${number}: closed.`);
  } else {
    console.log(`#${number}: already closed.`);
  }
}

console.log(
  `Done — commented=${commented} closed=${closed} skipped=${skipped}${DRY ? " (DRY_RUN)" : ""}`,
);
