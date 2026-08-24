import { describe, expect, test } from "bun:test";
import { isVersionBelow } from "./semver";

describe("isVersionBelow", () => {
  test("compares numerically, not as strings", () => {
    expect(isVersionBelow("1.9.9", "2.0.0")).toBe(true);
    // The reason this helper exists: "2.10.0" < "2.0.0" as a string compare.
    expect(isVersionBelow("2.10.0", "2.0.0")).toBe(false);
  });

  test("equal versions are not below", () => {
    expect(isVersionBelow("2.0.0", "2.0.0")).toBe(false);
  });

  test("missing segments count as zero", () => {
    expect(isVersionBelow("2", "2.0.0")).toBe(false);
    expect(isVersionBelow("2", "2.0.1")).toBe(true);
    expect(isVersionBelow("2.1", "2.0.0")).toBe(false);
  });

  test("pre-release suffixes are ignored", () => {
    expect(isVersionBelow("2.0.0-beta", "2.0.0")).toBe(false);
    expect(isVersionBelow("1.9.0-rc1", "2.0.0")).toBe(true);
  });

  test("a leading v is accepted", () => {
    expect(isVersionBelow("v2.1.0", "2.0.0")).toBe(false);
    expect(isVersionBelow("v1.9.0", "2.0.0")).toBe(true);
  });

  test("non-release Jellyseerr builds are unknown, not old", () => {
    // Jellyseerr's getAppVersion() returns `develop-<commitTag>` for every
    // build made off a non-release package.json — treating that as version 0
    // locked every develop/nightly/self-built server out of the integration.
    expect(isVersionBelow("develop-a1b2c3d", "2.0.0")).toBe(false);
    expect(isVersionBelow("develop-local", "2.0.0")).toBe(false);
    expect(isVersionBelow("develop", "2.0.0")).toBe(false);
  });

  test("empty and junk versions are not treated as below", () => {
    expect(isVersionBelow("", "2.0.0")).toBe(false);
    expect(isVersionBelow("unknown", "2.0.0")).toBe(false);
  });

  test("surrounding whitespace is tolerated", () => {
    expect(isVersionBelow("  1.0.0  ", "2.0.0")).toBe(true);
  });
});
