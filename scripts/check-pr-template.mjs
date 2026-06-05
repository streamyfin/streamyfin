#!/usr/bin/env bun
/**
 * Validates that a pull request body follows .github/pull_request_template.md:
 * required sections are filled in and the key checklist items are ticked.
 *
 * Usage:   bun scripts/check-pr-template.mjs <path-to-pr-body.txt>
 * Output:  a JSON array of human-readable problems (empty array = all good).
 * Exit:    0 = ok, 1 = one or more problems, 2 = no body file given.
 *
 * Env:     AUTHOR_ASSOCIATION — when OWNER/MEMBER/COLLABORATOR, the AI-disclosure
 *          check is skipped (maintainers self-police).
 */

import { existsSync, readFileSync } from "node:fs";

const bodyFile = process.argv[2];
if (!bodyFile) {
  console.error("usage: bun scripts/check-pr-template.mjs <pr-body-file>");
  process.exit(2);
}

let body;
try {
  body = readFileSync(bodyFile, "utf8").replace(/\r\n/g, "\n");
} catch (e) {
  console.error(`cannot read body file ${bodyFile}: ${e.message}`);
  process.exit(2);
}
const association = (process.env.AUTHOR_ASSOCIATION || "").toUpperCase();
const isMaintainer = ["OWNER", "MEMBER", "COLLABORATOR"].includes(association);

// Strip HTML comments in a single linear pass (indexOf scan): no regex backtracking
// and no loop-until-stable, so a crafted body can't drive it into super-linear time,
// and it leaves no `<!--` behind. An unterminated `<!-- …` drops to end-of-string.
const stripComments = (s) => {
  let out = "";
  let i = 0;
  for (;;) {
    const start = s.indexOf("<!--", i);
    if (start === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, start);
    const end = s.indexOf("-->", start + 4);
    if (end === -1) break; // unterminated comment: drop the rest
    i = end + 3;
  }
  return out.trim();
};

// Grab the text under a heading whose title contains `keyword`, up to the next heading
// or the end of the body.
const section = (keyword) => {
  const re = new RegExp(
    `(?:^|\\n)#{1,4}\\s*[^\\n]*${keyword}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,4}\\s|$)`,
    "i",
  );
  const m = body.match(re);
  return m ? m[1] : null;
};

const isFilled = (content) => {
  if (content == null) return false;
  // Template guidance lives in HTML comments; once stripped, a real answer remains.
  return stripComments(content).length > 0;
};

const issues = [];

if (section("Description") === null)
  issues.push("The **Description** section is missing.");
else if (!isFilled(section("Description")))
  issues.push(
    "The **Description** section is empty — describe what changed and why.",
  );

if (section("Ticket") === null)
  issues.push("The **Ticket / Issue** section is missing.");
else if (!isFilled(section("Ticket")))
  issues.push(
    "The **Ticket / Issue** section is empty — link an issue or write `N/A`.",
  );

if (section("Testing Instructions") === null)
  issues.push("The **Testing Instructions** section is missing.");
else if (!isFilled(section("Testing Instructions")))
  issues.push(
    "The **Testing Instructions** section is empty — tell reviewers how to test this, or write `N/A`.",
  );

const checklist = section("Checklist");
if (checklist === null) {
  issues.push("The **Checklist** section is missing.");
} else {
  if (!/- \[x\][^\n]*contribution guidelines/i.test(checklist))
    issues.push(
      "Please read and tick the **contribution guidelines** checklist item.",
    );
  if (!isMaintainer && !/- \[x\][^\n]*declared if AI/i.test(checklist))
    issues.push(
      "Please tick the **AI disclosure** checklist item (declare whether AI was used).",
    );
}

// Require the Screenshots section when the PR changes UI (.tsx under app/ or components/).
// PR_FILES points to a newline list of changed paths (provided by the workflow).
const filesPath = process.env.PR_FILES;
if (filesPath && existsSync(filesPath)) {
  const changed = readFileSync(filesPath, "utf8").split("\n").filter(Boolean);
  const touchesUI = changed.some(
    (f) =>
      /^(app|components)\/.*\.tsx$/.test(f) && !/\.(test|spec)\.tsx$/.test(f),
  );
  if (touchesUI) {
    const shots = section("Screenshots");
    if (shots === null)
      issues.push(
        "This PR changes UI (`.tsx`) — add the **Screenshots / GIFs** section with before/after media.",
      );
    else if (!isFilled(shots))
      issues.push(
        "This PR changes UI — the **Screenshots / GIFs** section is empty; add screenshots (or write `N/A` if it's genuinely not visual).",
      );
  }
}

console.log(JSON.stringify(issues));
process.exit(issues.length ? 1 : 0);
