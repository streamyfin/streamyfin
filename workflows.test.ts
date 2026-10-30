import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import ignore from "ignore";

// The CI workflows name modules, paths and commands by hand, and nothing fails
// when one of those lists falls behind the tree: the workflow stays green while
// it checks less than its comments say. These tests pin each list to what it
// stands for, so the drift fails here instead.

const root = __dirname;

const readWorkflow = (name: string) =>
  readFileSync(join(root, ".github/workflows", name), "utf8");

/**
 * The text without YAML and shell comments: a name that is only mentioned
 * does not count.
 */
const withoutComments = (text: string) => text.replace(/(^|\s)#.*$/gm, "$1");

/**
 * The items of the YAML list under `key:`, up to the first line that is not
 * one.
 */
const listUnder = (text: string, key: string) => {
  const lines = withoutComments(text).split("\n");
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  const items: string[] = [];
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const item = line.match(/^\s*- (["']?)(.+)\1\s*$/);
    if (!item) break;
    items.push(item[2]);
  }
  return items;
};

describe("native-tests.yml", () => {
  // Gradle runs the tasks the command names and no others, so a module left
  // out passes CI whatever a pull request breaks in it. The first version ran
  // mpv-player alone while exoplayer-player and background-downloader had
  // suites of their own, ForegroundPromotionTest among them.
  const tasks = [
    ...withoutComments(readWorkflow("native-tests.yml")).matchAll(
      /:([\w-]+):testDebugUnitTest\b/g,
    ),
  ].map((match) => match[1]);
  const modulesWithJvmTests = readdirSync(join(root, "modules"), {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(root, "modules", entry.name, "android/src/test")),
    )
    .map((entry) => entry.name);

  test("runs the JVM tests of every module that has some", () => {
    expect(modulesWithJvmTests).not.toEqual([]);
    // A non-empty list here names the modules to add to the Gradle command,
    // as :<module>:testDebugUnitTest.
    expect(modulesWithJvmTests.filter((name) => !tasks.includes(name))).toEqual(
      [],
    );
  });

  // The standalone Swift checks (scripts/ios/test-*.sh) need swiftc, so only
  // a macOS runner can run them; the runner script picks up every check, a new
  // one included.
  test("runs every standalone Swift check on macOS", () => {
    const workflow = withoutComments(readWorkflow("native-tests.yml"));
    expect(workflow).toMatch(/runs-on: macos-/);
    expect(workflow).toContain("bash scripts/ios/run-native-checks.sh");
  });

  // The JUnit and Swift readers replay the receiver vectors, and the Swift
  // checks live outside modules/: a change to any of them must start the job.
  test("starts on a change to what the native checks read", () => {
    const rules = listUnder(readWorkflow("native-tests.yml"), "modules");
    expect(rules).toEqual(
      expect.arrayContaining([
        "modules/**",
        "tests/native/**",
        "scripts/ios/**",
        "e2e/fixtures/receiver-protocol/**",
      ]),
    );
  });
});

/**
 * The files of the repository: the tree without .git and without what a
 * .gitignore leaves out, each read from its own directory. Walked in-process
 * rather than asked of `git ls-files`: see bun-test-discovery-leaks-fds.
 */
const repositoryFiles = (
  dir = "",
  rules: { dir: string; ignore: ReturnType<typeof ignore> }[] = [],
): string[] => {
  const gitignore = join(root, dir, ".gitignore");
  const inScope = existsSync(gitignore)
    ? [...rules, { dir, ignore: ignore().add(readFileSync(gitignore, "utf8")) }]
    : rules;
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = posix.join(dir, entry.name);
      const directory = entry.isDirectory();
      const ignored =
        entry.name === ".git" ||
        inScope.some((rule) =>
          rule.ignore.ignores(
            `${rule.dir ? posix.relative(rule.dir, path) : path}${directory ? "/" : ""}`,
          ),
        );
      if (ignored) return [];
      return directory ? repositoryFiles(path, inScope) : [path];
    },
  );
};

// The Cast API: the library, the receiver constants, and the module's own cast
// API, meant to take over from the library.
const CAST_PACKAGE = "react-native-google-cast";
const CAST_SOURCES = ["constants/Cast", "modules/mpv-player/src/cast"];

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
// Specs and test doubles never reach the APK the smoke flow drives.
const SPEC_OR_DOUBLE = /\.(test|perf-test)\.[cm]?[jt]sx?$|^test-utils\//;
// The specifier of an import, an export from, an import() or a require().
const IMPORT = /\b(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;

const isCastSource = (path: string) =>
  CAST_SOURCES.some(
    (source) =>
      path === source ||
      path.startsWith(`${source}/`) ||
      path.startsWith(`${source}.`),
  );

const importsCastApi = (file: string, specifier: string) => {
  if (specifier.startsWith("@/")) return isCastSource(specifier.slice(2));
  if (specifier.startsWith(".")) {
    return isCastSource(posix.join(posix.dirname(file), specifier));
  }
  return specifier === CAST_PACKAGE || specifier.startsWith(`${CAST_PACKAGE}/`);
};

/**
 * Whether `file`, whose text is `source`, is part of the Cast API or imports
 * it.
 */
const usesCastApi = (file: string, source: string) =>
  isCastSource(file) ||
  [...source.matchAll(IMPORT)].some(([, specifier]) =>
    importsCastApi(file, specifier),
  );

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether the filter counts `file` under `rule`. dorny/paths-filter matches
 * with picomatch and `dot: true`, which compares the two strings first and
 * then reads the rule as a glob. Of the glob syntax only `*` and `**` are
 * modelled; the spelling test below fails on the rest.
 */
const matches = (rule: string, file: string) => {
  if (rule === file) return true;
  const segments = rule.split("/");
  const pattern = segments
    .map((segment, index) => {
      const last = index === segments.length - 1;
      if (segment === "**") return last ? ".*" : "(?:[^/]*/)*";
      const name = segment.split("*").map(escapeRegExp).join("[^/]*");
      return last ? name : `${name}/`;
    })
    .join("");
  return new RegExp(`^${pattern}$`).test(file);
};

// picomatch reads ( ) [ ] { } ? ! + @ as glob syntax: `app/(auth)/**` matches
// app/auth/, not the route group. A rule that is a path of the repository is
// safe, the string comparison matches it first.
const GLOB_SYNTAX = /[()[\]{}?!+@]/;

// Free disk space, dependencies, prebuild and the APK build: about 28 minutes
// in the first runs of the workflow.
const MINUTES_BEFORE_THE_EMULATOR = 30;

describe("e2e-tier1-android.yml", () => {
  const workflow = readWorkflow("e2e-tier1-android.yml");

  describe("the cast filter", () => {
    // The emulator job costs half an hour, so it runs only on pull requests
    // that touch cast code. The first filter named a components/cast/ that
    // never existed and missed JellyfinCastStopReporter, which every launch on
    // a phone mounts: a change there would have skipped the smoke flow.
    const rules = listUnder(workflow, "cast");
    const files = repositoryFiles();
    const castCode = files.filter(
      (file) =>
        SOURCE_FILE.test(file) &&
        !SPEC_OR_DOUBLE.test(file) &&
        usesCastApi(file, readFileSync(join(root, file), "utf8")),
    );

    test("runs on its own workflow", () => {
      expect(rules).toContain(".github/workflows/e2e-tier1-android.yml");
    });

    test("covers every file that uses the Cast API", () => {
      // A non-empty list here names the files to add to the filter.
      expect(
        castCode.filter((file) => !rules.some((rule) => matches(rule, file))),
      ).toEqual([]);
    });

    test("names only rules that match a file", () => {
      // A non-empty list here names rules left behind by a typo or a move.
      expect(
        rules.filter((rule) => !files.some((file) => matches(rule, file))),
      ).toEqual([]);
    });

    test("spells its globs the way the filter reads them", () => {
      expect(
        rules.filter((rule) => GLOB_SYNTAX.test(rule) && !files.includes(rule)),
      ).toEqual([]);
    });

    test.each([
      [
        "the library",
        "components/Chromecast.tsx",
        'import { CastButton } from "react-native-google-cast";',
      ],
      [
        "the library through require",
        "app/_layout.tsx",
        'const GoogleCast = require("react-native-google-cast");',
      ],
      [
        "the receiver constants",
        "hooks/useMusicCast.ts",
        'import { RECEIVER_LOAD_TIMEOUT_MS } from "@/constants/Cast";',
      ],
      [
        "the module's cast API",
        "components/Chromecast.tsx",
        'import { CastButton } from "@/modules/mpv-player/src/cast";',
      ],
      [
        "the module's cast API from inside the module",
        "modules/mpv-player/src/index.ts",
        'export * from "./cast/session";',
      ],
    ])("counts a file that imports %s", (_, file, source) => {
      expect(usesCastApi(file, source)).toBe(true);
    });

    test("does not count a file that imports a namesake", () => {
      expect(
        usesCastApi(
          "components/Casting.tsx",
          'import { CASTING } from "@/constants/Casting";',
        ),
      ).toBe(false);
    });
  });

  describe("the emulator steps", () => {
    // A hung attempt that runs the job into its timeout cancels the job, and a
    // cancelled job skips the retry and the upload of the evidence.
    const job = workflow.slice(workflow.indexOf("\n  maestro:"));
    const minutes = (text: string) =>
      Number(text.match(/^\s*timeout-minutes:\s*(\d+)/m)?.[1]);
    const emulatorSteps = job
      .split(/\n(?=[ \t]*- name: )/)
      .filter((step) => step.includes("reactivecircus/android-emulator-runner"))
      .map((step) => ({
        name: step.match(/- name: (.+)/)?.[1],
        step: withoutComments(step),
      }));

    test.each(emulatorSteps)(
      "$name ends a hung attempt as a failure",
      ({ step }) => {
        // Maestro alone waits on a stalled device for as long as the job lets
        // it; maestro.py stops it and fails the attempt, and the runner then
        // shuts the emulator down before the retry boots one.
        expect(step).not.toMatch(/\bmaestro\s+test\b/);
        const flowSeconds = Number(
          step.match(/e2e\/bench\/maestro\.py .*--timeout[ =](\d+)/)?.[1],
        );
        // The step's own bound, which covers the boot and the install too,
        // comes after it.
        expect(flowSeconds).toBeLessThan(minutes(step) * 60);
      },
    );

    test("both attempts fit in the job after the build", () => {
      const attempts = emulatorSteps.reduce(
        (sum, { step }) => sum + minutes(step),
        0,
      );
      expect(attempts).toBeLessThanOrEqual(
        minutes(job) - MINUTES_BEFORE_THE_EMULATOR,
      );
    });
  });
});

describe("linting.yml", () => {
  // CONTRIBUTING.md asks for `bun run test` before a pull request, and CI runs
  // the same commands as one job each. Both lists are kept by hand: CI gained
  // the bench's own tests and the local gate did not.
  const ciCommands = listUnder(readWorkflow("linting.yml"), "command");
  const localGate: string[] = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  )
    .scripts.test.split("&&")
    .map((command: string) => command.trim().replace(/^bun run /, ""));
  // Biome without its fixes; the local gate runs the same rules through `lint`.
  const CI_ONLY = ["check"];

  test("bun run test runs every command of the CI gate", () => {
    expect(ciCommands).toContain("test:unit");
    // A non-empty list here names the scripts to chain into `test` in
    // package.json.
    expect(
      ciCommands.filter(
        (command) => !CI_ONLY.includes(command) && !localGate.includes(command),
      ),
    ).toEqual([]);
  });
});
