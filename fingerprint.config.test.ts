import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const config = require("./fingerprint.config.js");

const hashed = new Set<string>(
  config.extraSources.map((source: { filePath: string }) => source.filePath),
);

describe("fingerprint.config.js", () => {
  it("never hashes the per-build metadata in extra", () => {
    // app.config.ts writes the commit and run number into extra.build, so
    // hashing it would give every commit a new fingerprint.
    expect(config.sourceSkips).toContain("ExpoConfigExtraSection");
  });

  it("hashes the app extension sources", () => {
    // Config plugins copy targets/ in at prebuild, out of the fingerprint's sight.
    expect(hashed.has("targets")).toBe(true);
  });

  it("hashes every file passed as a config plugin option", () => {
    // The tvOS icons once missed this: a new icon would have shipped in a
    // repacked IPA with the old one still inside.
    const { expo } = JSON.parse(
      readFileSync(path.join(__dirname, "app.json"), "utf8"),
    );
    const optionFiles = JSON.stringify(
      expo.plugins.filter(Array.isArray).map((p: unknown[]) => p.slice(1)),
    )
      .match(/"\.\/[^"]+"/g)
      ?.map((quoted) => quoted.slice(3, -1))
      .filter((file) => existsSync(path.join(__dirname, file)));

    expect(optionFiles?.length).toBeGreaterThan(0);
    for (const file of optionFiles ?? []) {
      expect(hashed).toContain(file);
    }
  });
});
