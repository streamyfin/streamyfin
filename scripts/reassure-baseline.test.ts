import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  baseRefCandidates,
  changedScenarioFiles,
  currentCheckout,
  isScenarioFile,
} from "./reassure-baseline";

describe("isScenarioFile", () => {
  it.each([
    "components/home/Home.tv.perf-test.tsx",
    "utils/queryPersistence.perf-test.ts",
    "test-utils/serverImage.tsx",
  ])("copies %s onto the base", (file) => {
    expect(isScenarioFile(file)).toBe(true);
  });

  it.each([
    "components/home/Home.tv.tsx",
    "components/home/Home.tv.test.tsx",
    "docs/conventions/performance.md",
  ])("leaves %s to the base", (file) => {
    expect(isScenarioFile(file)).toBe(false);
  });
});

describe("baseRefCandidates", () => {
  it("looks on upstream before origin, then locally", () => {
    expect(baseRefCandidates("develop", ["origin", "upstream"])).toEqual([
      "upstream/develop",
      "origin/develop",
      "develop",
    ]);
  });

  it("skips a remote the clone does not have", () => {
    expect(baseRefCandidates("perf/tv-home", ["origin"])).toEqual([
      "origin/perf/tv-home",
      "perf/tv-home",
    ]);
  });
});

describe("currentCheckout", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "reassure-baseline-"));
    git("init", "-q", "-b", "feature");
    git(
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    );
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("returns the branch name on a branch", () => {
    expect(currentCheckout(repo)).toBe("feature");
  });

  // CI checks a PR out detached; `symbolic-ref` exits 1 there and used to
  // crash the baseline measurement instead of falling back to the commit.
  it("returns the commit when HEAD is detached", () => {
    const head = git("rev-parse", "HEAD");
    git("switch", "-q", "--detach");
    expect(currentCheckout(repo)).toBe(head);
  });
});

describe("changedScenarioFiles", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", ...args],
      { cwd: repo, encoding: "utf8" },
    ).trim();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "reassure-changed-"));
    git("init", "-q", "-b", "main");
    mkdirSync(join(repo, "test-utils"));
    // Long enough for git to see the move as a rename and not as add + delete.
    writeFileSync(
      join(repo, "test-utils/api.ts"),
      "export const x = 1;\n".repeat(20),
    );
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("switch", "-q", "-c", "feature");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  // `--diff-filter=AM` drops a rename, so a moved test double never reached the
  // base and its scenarios imported a path that did not exist there.
  it("includes a scenario file that was renamed", () => {
    renameSync(
      join(repo, "test-utils/api.ts"),
      join(repo, "test-utils/jellyfinApi.ts"),
    );
    git("add", ".");
    git("commit", "-q", "-m", "move");
    expect(
      changedScenarioFiles("main", git("rev-parse", "HEAD"), repo),
    ).toEqual(["test-utils/jellyfinApi.ts"]);
  });

  it("is empty when no scenario file changed", () => {
    writeFileSync(join(repo, "README.md"), "hi\n");
    git("add", ".");
    git("commit", "-q", "-m", "docs");
    expect(
      changedScenarioFiles("main", git("rev-parse", "HEAD"), repo),
    ).toEqual([]);
  });
});
