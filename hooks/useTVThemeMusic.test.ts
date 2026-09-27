import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

describe("TV theme audio session handoff", () => {
  for (const scenario of [
    "handoff",
    "mid-fade",
    "early-fade",
    "browsing",
    "pending-start",
  ]) {
    test(scenario, () => {
      // Keep hook/native mocks isolated from the rest of the Bun suite.
      const result = Bun.spawnSync([
        process.execPath,
        "run",
        fileURLToPath(
          new URL("../test-utils/tvThemeMusic.ts", import.meta.url),
        ),
        scenario,
      ]);
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
    });
  }
});
