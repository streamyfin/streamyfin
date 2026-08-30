import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ignore from "ignore";

// EAS Build never sees a working tree. eas-cli archives the project first and
// drops every path that matches .gitignore, tracked or not, so a force-added
// file is silently left behind. Metro then compiles a require() that cannot be
// resolved into a runtime throw when it sits inside try/catch (an optional
// dependency), so the build stays green and the asset first goes missing on
// TestFlight. That is how the subtitle preview shipped as "Failed to load
// preview": `*.mp4` is ignored and assets/sample_subtitled.mp4 was force-added.
//
// These tests pin every asset the JS bundle requires: it has to exist, and the
// ignore rules eas-cli applies must not match it. The rules are evaluated with
// the same `ignore` package eas-cli uses, in-process: bun's test discovery
// leaves thousands of file descriptors open, which breaks the stdio of any
// child process a test spawns, so `git check-ignore` is not an option here.

const root = join(__dirname, "..");
const SOURCE_DIRS = [
  "app",
  "components",
  "constants",
  "hooks",
  "modules",
  "providers",
  "utils",
];
const SOURCE_FILE = /\.tsx?$/;
const ASSET_REQUIRE = /require\(\s*["']@\/(assets\/[^"']+)["']\s*\)/g;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sourceFiles(path);
    }
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });

const requiredAssets = [
  ...new Set(
    SOURCE_DIRS.flatMap((dir) => sourceFiles(join(root, dir))).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(ASSET_REQUIRE)].map(
        (match) => match[1],
      ),
    ),
  ),
].sort();

/** "" (the root) and every directory between it and the file. */
const parentDirs = (file: string): string[] => {
  const parts = file.split("/").slice(0, -1);
  return ["", ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))];
};

/**
 * Whether eas-cli would leave the file out of the upload. Every .gitignore
 * between the repository root and the file applies, relative to its own
 * directory, and a rule in a parent file wins over an exception in a child
 * file — so any match ignores (mirror of eas-cli's vcs/local Ignore class).
 */
const droppedByEas = (file: string): boolean =>
  parentDirs(file).some((dir) => {
    const rules = join(root, dir, ".gitignore");
    if (!existsSync(rules)) return false;
    const relativePath = dir ? relative(dir, file) : file;
    return ignore().add(readFileSync(rules, "utf8")).ignores(relativePath);
  });

describe("assets required by the JS bundle survive an EAS build", () => {
  test("the scan finds the assets it is meant to guard", () => {
    expect(requiredAssets).toContain("assets/sample_subtitled.mp4");
  });

  test("every required asset exists", () => {
    const absent = requiredAssets.filter(
      (asset) => !existsSync(join(root, asset)),
    );
    expect(absent).toEqual([]);
  });

  test("no required asset matches an ignore rule", () => {
    // A non-empty list here names files EAS will drop from the upload even
    // though git tracks them; re-include each one below the rule it matches.
    expect(requiredAssets.filter(droppedByEas)).toEqual([]);
  });
});
