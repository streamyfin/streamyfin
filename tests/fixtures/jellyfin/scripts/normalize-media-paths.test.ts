import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..", "..", "..");
const fixtureRoot = join(repoRoot, "tests", "fixtures", "jellyfin");
const scriptPath = join(fixtureRoot, "scripts", "normalize-media-paths.sh");
const baseConfigPath = join(fixtureRoot, "base_config");

function runSqliteCheck(dbPath: string, sql: string): void {
  const result = spawnSync(
    "sh",
    ["-c", `sqlite3 "$1" "$2" | grep -qx 1`, "sh", dbPath, sql],
    {
      encoding: "utf8",
    },
  );

  expect(result.status).toBe(0);
}

describe("normalize-media-paths.sh", () => {
  test("rewrites Jellyfin root files and database item paths", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "streamyfin-jellyfin-"));
    try {
      const configPath = join(tempRoot, "config");
      const mediaPath = join(tempRoot, "media");
      cpSync(baseConfigPath, configPath, { recursive: true });

      const result = spawnSync("sh", [scriptPath, configPath, mediaPath], {
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(
        readFileSync(
          join(configPath, "root", "default", "Movies", "movies.mblink"),
          "utf8",
        ).trim(),
      ).toBe(`${mediaPath}/movies`);
      expect(
        readFileSync(
          join(configPath, "root", "default", "Shows", "options.xml"),
          "utf8",
        ),
      ).toContain(`<Path>${mediaPath}/shows</Path>`);

      const dbPath = join(configPath, "data", "jellyfin.db");
      runSqliteCheck(
        dbPath,
        "select count(*) = 0 from BaseItems where Path = '/media' or Path like '/media/%';",
      );
      runSqliteCheck(
        dbPath,
        "select count(*) = 10 from BaseItems where Path like '" +
          mediaPath.replaceAll("'", "''") +
          "/%';",
      );
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
