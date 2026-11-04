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
 * A scenario that needs code the PR introduces cannot run on the base, and
 * Reassure then keeps no baseline for any test of its file, which the report
 * would list as added instead of compared. So when the copied scenarios do not
 * all run, the base is measured again with its own scenarios, as it was before
 * this script existed, and the run says so.
 *
 * The base is the argument if given. Without one it is the target branch of
 * this branch's open PR (what CI measures against), else `develop`, looked up on
 * `upstream` first and then `origin`: a fork's `origin/develop` is often not
 * fetched, and is not the branch the PR lands on.
 *
 * Usage: bun scripts/reassure-baseline.ts [baseRef]
 */
import { execFileSync, spawnSync } from "node:child_process";

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

/** Whether `ref` already names a remote-tracking branch, like CI's `origin/develop`. */
const isRemoteRef = (ref: string, remotes: string[]) =>
  remotes.some((remote) => ref.startsWith(`${remote}/`));

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
 * The scenario files this branch adds or changes (`copy`) and the ones it
 * deletes (`remove`). Rename detection is off, so a moved file is an addition
 * at its new path and a deletion at its old one: left on the base, the old
 * file would run next to the copy under the same test names, and Reassure
 * refuses a result file with duplicated names.
 */
export const changedScenarioFiles = (
  baseRef: string,
  head: string,
  cwd?: string,
) => {
  const copy: string[] = [];
  const remove: string[] = [];
  const diff = execFileSync(
    "git",
    [
      "diff",
      "--name-status",
      "--no-renames",
      "--diff-filter=AMD",
      `${baseRef}...${head}`,
    ],
    { cwd, encoding: "utf8" },
  ).trim();
  for (const line of diff ? diff.split("\n") : []) {
    const [status, file] = line.split("\t");
    if (!isScenarioFile(file)) continue;
    (status === "D" ? remove : copy).push(file);
  }
  return { copy, remove };
};

/**
 * Whether a tracked file has changes. Untracked files are left out: switching
 * to the base keeps them, and `git stash` would not take them anyway.
 */
export const hasTrackedChanges = (cwd?: string) =>
  execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd,
    encoding: "utf8",
  }).trim() !== "";

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
  // A bare name, given or found, is looked up on the remotes first: the local
  // branch of that name is often behind, or missing.
  const candidates =
    explicit && isRemoteRef(explicit, remotes)
      ? [explicit]
      : baseRefCandidates(name, remotes);
  for (const remote of remotes) {
    attempt("git", ["fetch", "-q", remote, name.replace(`${remote}/`, "")]);
  }
  const found = candidates.find((ref) =>
    attempt("git", ["rev-parse", "--verify", "-q", `${ref}^{commit}`]),
  );
  if (!found) throw new Error(`No base branch found for ${name}.`);
  return found;
};

class Interrupted extends Error {}

const run = (command: string, args: string[]) => {
  const { status, signal } = spawnSync(command, args, { stdio: "inherit" });
  // Ctrl+C reaches the child as well. Stopping here lets `finally` put the
  // branch back instead of leaving the clone on the base.
  if (signal === "SIGINT" || signal === "SIGTERM") {
    throw new Interrupted(`${command} was interrupted`);
  }
  return status === 0;
};

const measureBase = (baseRef: string) => {
  if (hasTrackedChanges()) {
    throw new Error("Commit or stash your changes before measuring the base.");
  }
  const origin = currentCheckout();
  const head = git("rev-parse", "HEAD");
  const { copy, remove } = changedScenarioFiles(baseRef, head);
  const fromBranch = copy.length + remove.length > 0;
  const restoreBase = () => {
    git("reset", "--hard");
    if (copy.length > 0) git("clean", "-fdq", "--", ...copy);
  };
  // Without a listener, Ctrl+C would end this process before `finally` runs.
  const ignoreInterrupt = () => {};
  process.on("SIGINT", ignoreInterrupt);

  try {
    git("switch", "--detach", baseRef);
    // Not guarded: a base that cannot install cannot be measured.
    if (!run("bun", ["install", "--frozen-lockfile"])) {
      throw new Error(`bun install failed on ${baseRef}`);
    }
    if (fromBranch) {
      if (copy.length > 0) git("checkout", head, "--", ...copy);
      if (remove.length > 0) {
        git("rm", "-q", "--ignore-unmatch", "--", ...remove);
      }
      console.log(
        `Measuring ${baseRef} with this branch's scenarios: ${copy.length} copied, ${remove.length} removed.`,
      );
    }
    if (!run("bun", ["run", "--if-present", "perf:baseline"])) {
      // Reassure writes its result file before Jest starts, so the file always
      // exists; the exit status is what says a file could not run.
      if (!fromBranch)
        throw new Error(`No baseline was measured on ${baseRef}`);
      console.warn(
        "::warning::This branch's scenarios do not all run on the base, so the base is measured with its own scenarios.",
      );
      restoreBase();
      if (!run("bun", ["run", "--if-present", "perf:baseline"])) {
        throw new Error(`No baseline was measured on ${baseRef}`);
      }
    }
  } finally {
    process.off("SIGINT", ignoreInterrupt);
    restoreBase();
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
  try {
    measureBase(baseRef);
  } catch (error) {
    if (!(error instanceof Interrupted)) throw error;
    console.error("Interrupted; this branch is checked out again.");
    process.exitCode = 130;
  }
}
