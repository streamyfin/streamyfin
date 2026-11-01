import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  hasTrackedChanges,
  isScenarioFile,
} from "./reassure-baseline";

// Throwaway commits: never call the developer's signer (a global
// commit.gpgsign=true would prompt for a passphrase or fail the commit).
const NO_SIGN = [
  "-c",
  "user.name=t",
  "-c",
  "user.email=t@t",
  "-c",
  "commit.gpgsign=false",
];

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
    git(...NO_SIGN, "commit", "-q", "--allow-empty", "-m", "init");
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
    execFileSync("git", [...NO_SIGN, ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();

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
  // base and its scenarios imported a path that did not exist there. The old
  // path goes too: left on the base, it ran next to the copy under the same
  // test names, and Reassure rejected the duplicated names.
  it("copies a renamed scenario file and removes its old path", () => {
    renameSync(
      join(repo, "test-utils/api.ts"),
      join(repo, "test-utils/jellyfinApi.ts"),
    );
    git("add", ".");
    git("commit", "-q", "-m", "move");
    expect(
      changedScenarioFiles("main", git("rev-parse", "HEAD"), repo),
    ).toEqual({
      copy: ["test-utils/jellyfinApi.ts"],
      remove: ["test-utils/api.ts"],
    });
  });

  it("is empty when no scenario file changed", () => {
    writeFileSync(join(repo, "README.md"), "hi\n");
    git("add", ".");
    git("commit", "-q", "-m", "docs");
    expect(
      changedScenarioFiles("main", git("rev-parse", "HEAD"), repo),
    ).toEqual({ copy: [], remove: [] });
  });
});

describe("hasTrackedChanges", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", [...NO_SIGN, ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "reassure-clean-"));
    git("init", "-q", "-b", "main");
    writeFileSync(join(repo, "a.ts"), "export {};\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  // An untracked folder (a leftover submodule checkout, say) blocked the run,
  // and `git stash` cannot clear it.
  it("ignores untracked files", () => {
    mkdirSync(join(repo, "leftover"));
    writeFileSync(join(repo, "leftover/file.txt"), "x\n");
    expect(hasTrackedChanges(repo)).toBe(false);
  });

  it("sees an edited tracked file", () => {
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    expect(hasTrackedChanges(repo)).toBe(true);
  });
});

describe("measuring the base", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", [...NO_SIGN, ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  const write = (file: string, content: string) =>
    writeFileSync(join(repo, file), content);

  // A stand-in for `reassure --baseline`: like Reassure it writes the result
  // file before running anything, and it fails a scenario that needs code the
  // base does not have.
  const measure = `const fs = require("fs");
fs.mkdirSync(".reassure", { recursive: true });
fs.writeFileSync(".reassure/baseline.perf", "header\\n");
let failed = false;
for (const file of fs.readdirSync(".").filter((f) => f.endsWith(".perf-test.ts"))) {
  if (fs.readFileSync(file, "utf8").includes("branch-only")) failed = true;
  else fs.appendFileSync(".reassure/baseline.perf", file + "\\n");
}
process.exit(failed ? 1 : 0);
`;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "reassure-measure-"));
    git("init", "-q", "-b", "main");
    write(
      "package.json",
      JSON.stringify({ scripts: { "perf:baseline": "node measure.js" } }),
    );
    write(".gitignore", "node_modules\n.reassure\n");
    write("measure.js", measure);
    write("home.perf-test.ts", "// home scenario\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("switch", "-q", "-c", "feature");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  const measureBase = () =>
    execFileSync("bun", [join(__dirname, "reassure-baseline.ts"), "main"], {
      cwd: repo,
      encoding: "utf8",
      stdio: "pipe",
    });

  // The branch's copy of a scenario file imported code only the branch had,
  // so the whole file failed on the base and lost its baseline: the report
  // then listed its scenarios as added under "No regressions".
  it("keeps the base's own scenarios when the branch's cannot run there", () => {
    write("home.perf-test.ts", "// home scenario, branch-only import\n");
    git("commit", "-qam", "change the scenario");

    measureBase();

    expect(
      readFileSync(join(repo, ".reassure/baseline.perf"), "utf8"),
    ).toContain("home.perf-test.ts");
    expect(git("symbolic-ref", "--short", "HEAD")).toBe("feature");
    expect(git("status", "--porcelain", "--untracked-files=no")).toBe("");
  });
});
