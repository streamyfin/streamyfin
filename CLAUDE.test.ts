import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// CLAUDE.md is loaded into an assistant's context on every session, so a stale
// line there is worse than no line: it is a confident wrong answer. These tests
// pin the two lists that drift the fastest, in both directions, so adding or
// removing a module or a tab group fails here until the file is updated.

const root = __dirname;
const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");

const directories = (path: string) =>
  readdirSync(join(root, path), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

/**
 * Backticked names in the sentence that starts with `heading`, keeping only the
 * tokens that look like the thing being listed. The sentence ends at the next
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

const missing = (expected: string[], present: string[]) =>
  expected.filter((name) => !present.includes(name));

describe("CLAUDE.md stays true", () => {
  const modules = directories("modules");
  const documentedModules = documentedNames("**Native modules**", MODULE_NAME);

  test("every native module is documented", () => {
    // A non-empty list here names the modules to add to the "Native modules"
    // paragraph of CLAUDE.md.
    expect(missing(modules, documentedModules)).toEqual([]);
  });

  test("no documented native module has been removed", () => {
    // A non-empty list here names modules CLAUDE.md still advertises but that
    // no longer exist under modules/.
    expect(missing(documentedModules, modules)).toEqual([]);
  });

  // The combined group holds routes shared by several tabs; it is described in
  // its own sentence rather than listed as a tab.
  const tabs = directories("app/(auth)/(tabs)").filter(
    (name) => name.startsWith("(") && !name.includes(","),
  );
  const documentedTabs = documentedNames("Tab groups:", TAB_GROUP);

  test("every tab group is documented", () => {
    expect(missing(tabs, documentedTabs)).toEqual([]);
  });

  test("no documented tab group has been removed", () => {
    expect(missing(documentedTabs, tabs)).toEqual([]);
  });

  test("every convention document is indexed", () => {
    // The reverse of the link check: a new docs/conventions/ file that nobody
    // added a row for would otherwise stay invisible to whoever reads CLAUDE.md.
    // Scoped to the Conventions table on purpose: a passing mention elsewhere in
    // the file is not an index entry.
    const table = claudeMd.split("## Conventions")[1]?.split("\n## ")[0] ?? "";
    const indexed = [
      ...table.matchAll(/\]\((docs\/conventions\/[^)]+\.md)\)/g),
    ].map((match) => match[1]);
    const documents = readdirSync(join(root, "docs/conventions"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => `docs/conventions/${name}`);
    expect(documents.filter((path) => !indexed.includes(path))).toEqual([]);
  });

  test("every convention document referenced exists", () => {
    const links = [...claudeMd.matchAll(/\]\((docs\/[^)]+\.md)\)/g)].map(
      (match) => match[1],
    );
    const broken = links.filter((path) => {
      try {
        readFileSync(join(root, path), "utf8");
        return false;
      } catch {
        return true;
      }
    });
    expect(broken).toEqual([]);
  });
});
