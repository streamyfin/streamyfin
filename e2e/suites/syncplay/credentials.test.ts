import { resolveCredentials } from "./credentials";

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

  test("reads the item codes from the environment", async () => {
    const resolved = await resolveCredentials(
      {
        E2E_BENCH_CONFIG: "/private/bench.json",
        E2E_SYNCPLAY_ITEMS: "E01, V02",
      },
      reader({
        "bench.json": benchConfig({
          "syncplay-host": { username: "test", password: "p1" },
          "syncplay-guest": { username: "standard", password: "p2" },
        }),
      }),
      "/repo/e2e/suites/syncplay",
    );
    expect(resolved.itemCodes).toEqual(["E01", "V02"]);
  });
});
