import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  baseRefCandidates,
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
