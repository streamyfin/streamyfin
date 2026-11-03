import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertCanManageUsers,
  gitCommittable,
  resolveCredentials,
} from "./credentials";

const localCredentials = (url: string) =>
  JSON.stringify({
    url,
    serverVersion: "10.11.11",
    password: "SyncPlay-local-2026",
    host: { name: "syncplay-host", userId: "h", token: "t1" },
    guest: { name: "syncplay-guest", userId: "g", token: "t2" },
    items: [{ id: "a", name: "Clip 1", durationTicks: 1200000000 }],
  });

const benchConfig = (
  accounts: Record<string, { username: string; password: string }>,
) =>
  JSON.stringify({
    servers: {
      beta1011: {
        url: "http://beta.example.test:8110",
        label: "10.11",
        accounts,
      },
    },
    targets: { chromecasts: [] },
    keep_dir: "/tmp/keep",
    redact: [],
  });

const reader = (contents: Record<string, string>) => async (path: string) => {
  const match = Object.entries(contents).find(([name]) => path.endsWith(name));
  if (!match) throw new Error(`no such file ${path}`);
  return match[1];
};

describe("assertCanManageUsers", () => {
  test("accepts an administrator", () => {
    expect(() =>
      assertCanManageUsers(
        { Policy: { IsAdministrator: true } },
        "syncplay-host",
      ),
    ).not.toThrow();
  });

  test("names the profile that lacks the permission", () => {
    expect(() =>
      assertCanManageUsers(
        { Policy: { IsAdministrator: false } },
        "syncplay-host",
      ),
    ).toThrow(
      'the "syncplay-host" account must be an administrator: the harness creates and deletes a restricted account with it',
    );
    expect(() => assertCanManageUsers({}, "syncplay-host")).toThrow(
      "syncplay-host",
    );
  });
});

describe("resolveCredentials", () => {
  test("uses the throwaway server by default and refuses a remote host", async () => {
    const local = await resolveCredentials(
      {},
      reader({
        "credentials.json": localCredentials("http://127.0.0.1:18096"),
      }),
      "/repo/e2e/suites/syncplay",
    );
    expect(local.url).toBe("http://127.0.0.1:18096");
    expect(local.host).toEqual({
      name: "syncplay-host",
      password: "SyncPlay-local-2026",
    });
    expect(local.guest).toEqual({
      name: "syncplay-guest",
      password: "SyncPlay-local-2026",
    });
    expect(local.items).toEqual([
      { id: "a", name: "Clip 1", durationTicks: 1200000000 },
    ]);
    expect(local.itemCodes).toBeUndefined();

    await expect(
      resolveCredentials(
        {},
        reader({
          "credentials.json": localCredentials("http://10.0.0.5:8096"),
        }),
        "/repo/e2e/suites/syncplay",
      ),
    ).rejects.toThrow("Local test server required");
  });

  test("takes the bench server and its SyncPlay accounts when E2E_BENCH_CONFIG is set", async () => {
    const resolved = await resolveCredentials(
      { E2E_BENCH_CONFIG: "/private/bench.json", E2E_BENCH_SERVER: "beta1011" },
      reader({
        "bench.json": benchConfig({
          "syncplay-host": { username: "test", password: "p1" },
          "syncplay-guest": { username: "standard", password: "p2" },
        }),
      }),
      "/repo/e2e/suites/syncplay",
    );
    expect(resolved.url).toBe("http://beta.example.test:8110");
    expect(resolved.host).toEqual({ name: "test", password: "p1" });
    expect(resolved.guest).toEqual({ name: "standard", password: "p2" });
    expect(resolved.items).toBeUndefined();
    expect(resolved.itemCodes).toEqual(["V01", "V03", "V06"]);
  });

  test("strips every trailing slash from the bench server address", async () => {
    // One was stripped and the SDK took off another: a third left request paths
    // starting with //, which a server or proxy may not route.
    const config = JSON.parse(
      benchConfig({
        "syncplay-host": { username: "test", password: "p1" },
        "syncplay-guest": { username: "standard", password: "p2" },
      }),
    );
    config.servers.beta1011.url = "http://beta.example.test:8110/jellyfin///";
    const resolved = await resolveCredentials(
      { E2E_BENCH_CONFIG: "/private/bench.json" },
      reader({ "bench.json": JSON.stringify(config) }),
      "/repo/e2e/suites/syncplay",
    );
    expect(resolved.url).toBe("http://beta.example.test:8110/jellyfin");
  });

  test("refuses a bench config that git would commit", async () => {
    // The Python bench refused such a file and this reader took it, passwords and all.
    await expect(
      resolveCredentials(
        { E2E_BENCH_CONFIG: "/repo/e2e/bench/mine.json" },
        reader({ "mine.json": benchConfig({}) }),
        "/repo/e2e/suites/syncplay",
        () => true,
      ),
    ).rejects.toThrow("git does not ignore");
  });

  test("names the missing SyncPlay account", async () => {
    await expect(
      resolveCredentials(
        { E2E_BENCH_CONFIG: "/private/bench.json" },
        reader({
          "bench.json": benchConfig({
            "syncplay-host": { username: "test", password: "p1" },
          }),
        }),
        "/repo/e2e/suites/syncplay",
      ),
    ).rejects.toThrow("syncplay-guest");
  });

  const withItems = (items: string) =>
    resolveCredentials(
      { E2E_BENCH_CONFIG: "/private/bench.json", E2E_SYNCPLAY_ITEMS: items },
      reader({
        "bench.json": benchConfig({
          "syncplay-host": { username: "test", password: "p1" },
          "syncplay-guest": { username: "standard", password: "p2" },
        }),
      }),
      "/repo/e2e/suites/syncplay",
    );

  test("reads the item codes from the environment", async () => {
    const resolved = await withItems("E01, V02, V03");
    expect(resolved.itemCodes).toEqual(["E01", "V02", "V03"]);
  });

  test("refuses anything but three distinct item codes before any step runs", async () => {
    // Two codes used to pass here and stop the run on "Invalid SyncPlay queue request", after a
    // dozen steps had already run against the shared server.
    for (const items of ["E01, V02", "E01, V02, V03, V06", "E01, V02, V02"]) {
      await expect(withItems(items)).rejects.toThrow(
        `E2E_SYNCPLAY_ITEMS must name 3 distinct lab codes, one per queue item; got "${items}"`,
      );
    }
  });

  test("falls back to the default codes when the variable is empty", async () => {
    expect((await withItems(" , ")).itemCodes).toEqual(["V01", "V03", "V06"]);
  });
});

describe("gitCommittable", () => {
  const root = resolve(__dirname, "../../..");
  const committable = gitCommittable(root);

  test("says which files of the checkout a git add would take", () => {
    const stem = join(root, `e2e/bench/committable-test-${process.pid}`);
    try {
      writeFileSync(`${stem}.json`, "{}");
      writeFileSync(`${stem}.local.json`, "{}");
      expect(committable(`${stem}.json`)).toBe(true);
      expect(committable(`${stem}.local.json`)).toBe(false);
      expect(committable("/private/bench.json")).toBe(false);
    } finally {
      rmSync(`${stem}.json`, { force: true });
      rmSync(`${stem}.local.json`, { force: true });
    }
  });

  test("follows a link to the file it points at, as the Python bench does", () => {
    // A link of the checkout to a config kept outside it was refused here and taken there.
    const outside = mkdtempSync(join(tmpdir(), "bench-config-"));
    const link = join(root, `e2e/bench/committable-link-${process.pid}.json`);
    try {
      writeFileSync(join(outside, "bench.json"), "{}");
      symlinkSync(join(outside, "bench.json"), link);
      expect(committable(link)).toBe(false);
    } finally {
      rmSync(link, { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("counts a git that cannot start as a yes, and only a missing git as a no", () => {
    // A git that exists and fails to start let the file load.
    const failing = (code: string) =>
      gitCommittable(root, () => ({
        error: Object.assign(new Error(code), { code }),
        status: null,
      }));
    const inside = join(root, "e2e/bench/anything.json");
    expect(failing("EACCES")(inside)).toBe(true);
    expect(failing("ETIMEDOUT")(inside)).toBe(true);
    expect(failing("ENOENT")(inside)).toBe(false);
  });
});
