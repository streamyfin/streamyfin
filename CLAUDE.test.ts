import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// CLAUDE.md is loaded into an assistant's context on every session, so a stale
// line there is worse than no line: it is a confident wrong answer. These tests
// pin the two lists that drift the fastest, in both directions, so adding or
// removing a module or a tab group fails here until the file is updated.

const root = join(import.meta.dir);
const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");

const directories = (path: string) =>
  readdirSync(join(root, path), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

/**
 * Backticked names in the sentence that starts with `heading`, keeping only the
 * tokens that look like the thing being listed. The paragraph ends at the next
 * bullet or blank line, so a neighbouring rule cannot leak into the list.
 */
const documentedNames = (heading: string, shape: RegExp) => {
  const sentence = claudeMd.split(heading)[1]?.split(/\n\s*\n|\n- /)[0] ?? "";
  return [...sentence.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((name) => shape.test(name));
};

const MODULE_NAME = /^[a-z][a-z-]*$/;
const TAB_GROUP = /^\([a-z-]+\)$/;

describe("CLAUDE.md stays true", () => {
  test("every native module is documented", () => {
    const documented = documentedNames("**Native modules**", MODULE_NAME);
    for (const name of directories("modules")) {
      expect(
        documented,
        `modules/${name} exists but CLAUDE.md does not mention it. Add it to the "Native modules" paragraph.`,
      ).toContain(name);
    }
  });

  test("no documented native module has been removed", () => {
    const actual = directories("modules");
    for (const name of documentedNames("**Native modules**", MODULE_NAME)) {
      expect(
        actual,
        `CLAUDE.md lists the native module "${name}", which no longer exists under modules/.`,
      ).toContain(name);
    }
  });

  test("every tab group is documented", () => {
    const documented = documentedNames("Tab groups:", TAB_GROUP);
    // The combined group holds routes shared by several tabs; it is described
    // in its own sentence rather than listed as a tab.
    const tabs = directories("app/(auth)/(tabs)").filter(
      (name) => name.startsWith("(") && !name.includes(","),
    );
    for (const name of tabs) {
      expect(
        documented,
        `app/(auth)/(tabs)/${name} exists but CLAUDE.md does not list it under "Tab groups".`,
      ).toContain(name);
    }
  });

  test("no documented tab group has been removed", () => {
    const actual = directories("app/(auth)/(tabs)");
    for (const name of documentedNames("Tab groups:", TAB_GROUP)) {
      expect(
        actual,
        `CLAUDE.md lists the tab group "${name}", which no longer exists under app/(auth)/(tabs)/.`,
      ).toContain(name);
    }
  });

  test("every convention document referenced is present", () => {
    for (const [, path] of claudeMd.matchAll(/\]\((docs\/[^)]+\.md)\)/g)) {
      expect(
        () => readFileSync(join(root, path), "utf8"),
        `CLAUDE.md links to ${path}, which does not exist.`,
      ).not.toThrow();
    }
  });
});
