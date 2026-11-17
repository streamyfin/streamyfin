import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { swiftUiModule } from "./swiftUi";

const ROOT = path.join(__dirname, "..");
const SOURCE_DIRS = ["app", "components", "hooks", "providers", "utils"];

// The app loads SwiftUI lazily and off TV only:
// `const { Host, Text: SwiftUIText } = Platform.isTV ? {} : require("@expo/ui/swift-ui")`.
const DESTRUCTURED_REQUIRE =
  /const\s*\{([^}]*)\}\s*=[^;]*?require\("@expo\/ui\/swift-ui"\)/g;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // A hidden folder holds no source. The lint specs write their probes in
      // components/.lint-probe-* and remove them while this scan, in another
      // worker, may be listing or reading them: the suite failed on ENOENT.
      return entry.name === "node_modules" || entry.name.startsWith(".")
        ? []
        : sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(perf-)?test\./.test(entry.name)
      ? [file]
      : [];
  });

/** Every view a source file takes out of `@expo/ui/swift-ui`, by name. */
const swiftUiViewsUsed = () => {
  const names = new Set<string>();
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      for (const [, list] of source.matchAll(DESTRUCTURED_REQUIRE)) {
        for (const entry of list.split(",")) {
          const name = entry.split(":")[0].trim();
          if (name) names.add(name);
        }
      }
    }
  }
  return [...names].sort();
};

// `unitSetup.ts` puts the double in place of the module for every spec, so a
// view it lacks comes out `undefined` and React throws "Element type is
// invalid" in any spec that renders it.
test("the SwiftUI double stands in for every view the app takes", () => {
  const used = swiftUiViewsUsed();
  expect(used).toEqual(expect.arrayContaining(["Host", "Menu"]));
  expect(used.filter((name) => !(name in swiftUiModule))).toEqual([]);
});
