/**
 * Measures the Reassure baseline on a base branch, with the scenarios of the
 * branch you are on.
 *
 * Switching to the base removes the scenarios a PR adds and reverts the ones it
 * changes, so a new scenario would have no baseline, and a changed one would be
 * measured as a different test. Here the PR's scenario files (and the test
 * doubles they share) are copied onto the base first, so both sides run the same
 * test and only the code under test differs.
 *
 * A scenario that needs code the PR introduces cannot run on the base. Its
 * failure is reported and the baseline of every other scenario is kept.
 *
 * The base is the argument if given. Without one it is the target branch of
 * this branch's open PR (what CI measures against), else `develop`, looked up on
 * `upstream` first and then `origin`: a fork's `origin/develop` is often not
 * fetched, and is not the branch the PR lands on.
 *
 * Usage: bun scripts/reassure-baseline.ts [baseRef]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/** What gets copied onto the base: the scenarios and the doubles they share. */
export const isScenarioFile = (file: string) =>
  /\.perf-test\.[jt]sx?$/.test(file) || file.startsWith("test-utils/");

/** Where a branch name may live, nearest to the PR's real target first. */
export const baseRefCandidates = (name: string, remotes: string[]) => [
  ...["upstream", "origin"]
    .filter((remote) => remotes.includes(remote))
    .map((remote) => `${remote}/${name}`),
  name,
];

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const attempt = (command: string, args: string[]) => {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

/**
 * What to switch back to once the base is measured: the branch name, or the
 * commit when HEAD is detached. CI checks a PR out detached, where
 * `symbolic-ref` exits 1, so its failure is the signal and not an error.
 */
export const currentCheckout = (cwd?: string) => {
  const out = (args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    return out(["symbolic-ref", "-q", "--short", "HEAD"]);
  } catch {
    return out(["rev-parse", "HEAD"]);
  }
};

/**
 * The scenario files this branch adds or changes. Rename detection is off so a
 * moved file shows up as an addition at its new path: `--diff-filter=AM` would
 * otherwise drop it as a rename, and the base would run without it.
 */
export const changedScenarioFiles = (
  baseRef: string,
  head: string,
  cwd?: string,
) =>
  execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=AM",
      `${baseRef}...${head}`,
    ],
    { cwd, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(isScenarioFile);

const resolveBaseRef = (explicit?: string) => {
  const remotes = git("remote").split("\n");
  const name =
    explicit ||
    attempt("gh", [
      "pr",
      "view",
      "--json",
      "baseRefName",
      "-q",
      ".baseRefName",
    ]) ||
    "develop";
  const candidates = explicit ? [explicit] : baseRefCandidates(name, remotes);
  for (const remote of remotes) {
    attempt("git", ["fetch", "-q", remote, name.replace(`${remote}/`, "")]);
  }
  const found = candidates.find((ref) =>
    attempt("git", ["rev-parse", "--verify", "-q", `${ref}^{commit}`]),
  );
  if (!found) throw new Error(`No base branch found for ${name}.`);
  return found;
};

const run = (command: string, args: string[]) => {
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  return status === 0;
};

const measureBase = (baseRef: string) => {
  if (git("status", "--porcelain")) {
    throw new Error("Commit or stash your changes before measuring the base.");
  }
  const origin = currentCheckout();
  const head = git("rev-parse", "HEAD");
  const changed = changedScenarioFiles(baseRef, head);

  try {
    git("switch", "--detach", baseRef);
    // Not guarded: a base that cannot install cannot be measured.
    if (!run("bun", ["install", "--frozen-lockfile"])) {
      throw new Error(`bun install failed on ${baseRef}`);
    }
    if (changed.length > 0) {
      git("checkout", head, "--", ...changed);
      console.log(
        `Measuring ${baseRef} with ${changed.length} scenario files from this branch.`,
      );
    }
    // Reassure appends each scenario's result as it finishes, so a scenario that
    // cannot run on the base fails the command but leaves the others in place.
    if (!run("bun", ["run", "--if-present", "perf:baseline"])) {
      if (!existsSync(".reassure/baseline.perf")) {
        throw new Error(`No baseline was measured on ${baseRef}`);
      }
      console.warn(
        "::warning::Some scenarios could not run on the base and have no baseline.",
      );
    }
  } finally {
    git("reset", "--hard");
    if (changed.length > 0) git("clean", "-fdq", "--", ...changed);
    git(
      "switch",
      origin === head ? "--detach" : origin,
      ...(origin === head ? [head] : []),
    );
    // Not thrown: that would hide the error this `finally` is cleaning up after.
    // The PR is measured next without a reinstall, so a failure must be seen.
    if (!run("bun", ["install", "--frozen-lockfile"])) {
      console.error("::error::bun install failed while restoring this branch.");
      process.exitCode = 1;
    }
  }
};

if (require.main === module) {
  const baseRef = resolveBaseRef(process.argv[2]);
  console.log(`Measuring the base ${baseRef}.`);
  measureBase(baseRef);
}
