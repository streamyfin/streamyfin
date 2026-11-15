/**
 * Where the SyncPlay harness gets its server and accounts.
 *
 * By default it uses the throwaway Docker server that setup.py starts and refuses any other
 * host. With E2E_BENCH_CONFIG set, it takes a server of the shared bench configuration and
 * its `syncplay-host` / `syncplay-guest` accounts, and the media items are resolved later by
 * lab code against that server.
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export interface SyncPlayAccount {
  name: string;
  password: string;
}

export interface SyncPlayItem {
  id: string;
  name: string;
  durationTicks?: number | null;
}

export interface SyncPlayCredentials {
  source: "local" | "bench";
  url: string;
  serverVersion?: string;
  host: SyncPlayAccount;
  guest: SyncPlayAccount;
  /** Known up front on the throwaway server, resolved from `itemCodes` on a bench server. */
  items?: SyncPlayItem[];
  itemCodes?: string[];
}

export const DEFAULT_BENCH_SERVER = "beta1011";
export const DEFAULT_ITEM_CODES = ["V01", "V03", "V06"];
// The queue steps play, append, insert and reorder exactly this many distinct items.
const ITEM_COUNT = DEFAULT_ITEM_CODES.length;
const HOST_PROFILE = "syncplay-host";
const GUEST_PROFILE = "syncplay-guest";

type Env = Record<string, string | undefined>;
type ReadFile = (path: string) => Promise<string>;

interface BenchAccount {
  username: string;
  password: string;
}

interface BenchConfig {
  servers: Record<
    string,
    { url: string; accounts: Record<string, BenchAccount> }
  >;
}

const benchAccount = (
  config: BenchConfig,
  server: string,
  profile: string,
): SyncPlayAccount => {
  const account = config.servers[server]?.accounts[profile];
  if (!account) {
    throw new Error(
      `bench config has no "${profile}" account for server ${server}; add it next to the other profiles`,
    );
  }
  return { name: account.username, password: account.password };
};

/**
 * Fewer codes, or a code twice, used to fail late with "Invalid SyncPlay queue request", after
 * a dozen steps had already run against the shared server.
 */
const itemCodes = (raw: string | undefined): string[] => {
  const codes =
    raw
      ?.split(",")
      .map((code) => code.trim())
      .filter(Boolean) ?? [];
  if (!codes.length) return DEFAULT_ITEM_CODES;
  if (codes.length !== ITEM_COUNT || new Set(codes).size !== ITEM_COUNT) {
    throw new Error(
      `E2E_SYNCPLAY_ITEMS must name ${ITEM_COUNT} distinct lab codes, one per queue item; got "${raw}"`,
    );
  }
  return codes;
};

/**
 * Whether a `git add` in the checkout would take this file: it lies inside and git does not
 * ignore it, which the Python bench refuses too. A link is followed to its file, and only a
 * missing git counts as no: one that does not start, answer or succeed cannot vouch for the file.
 */
export const gitCommittable =
  (
    root: string,
    spawn: (
      command: string,
      args: string[],
      options: { timeout: number },
    ) => { error?: Error; status: number | null } = spawnSync,
  ) =>
  (path: string): boolean => {
    const real = (target: string) => {
      try {
        return realpathSync(target);
      } catch {
        return resolve(target);
      }
    };
    const file = real(path);
    if (!file.startsWith(`${real(root)}${sep}`)) return false;
    const result = spawn("git", ["-C", root, "check-ignore", "-q", file], {
      timeout: 10_000,
    });
    if (result.error) {
      return (result.error as NodeJS.ErrnoException).code !== "ENOENT";
    }
    // 0: ignored. 1 is not ignored, and 128 a fatal error (no checkout, a
    // dubious owner), which leaves the file unchecked: both refuse it.
    return result.status !== 0;
  };

const fromBench = async (
  env: Env,
  readFile: ReadFile,
  committable: (path: string) => boolean,
): Promise<SyncPlayCredentials> => {
  const path = env.E2E_BENCH_CONFIG as string;
  if (committable(path)) {
    throw new Error(
      `${path}: E2E_BENCH_CONFIG points at a file of the checkout that git does not ignore, or could not check, which a git add could commit with its passwords; move it out of the repository or name it e2e/bench/<name>.local.json`,
    );
  }
  const config = JSON.parse(await readFile(path)) as BenchConfig;
  const server = env.E2E_BENCH_SERVER ?? DEFAULT_BENCH_SERVER;
  if (!config.servers[server]) {
    throw new Error(
      `bench config has no server ${server}; known: ${Object.keys(config.servers).join(", ")}`,
    );
  }
  return {
    source: "bench",
    url: config.servers[server].url.replace(/\/+$/, ""),
    host: benchAccount(config, server, HOST_PROFILE),
    guest: benchAccount(config, server, GUEST_PROFILE),
    itemCodes: itemCodes(env.E2E_SYNCPLAY_ITEMS),
  };
};

const fromLocal = async (
  readFile: ReadFile,
  benchDir: string,
): Promise<SyncPlayCredentials> => {
  const local = JSON.parse(
    await readFile(`${benchDir}/.state/credentials.json`),
  ) as {
    url: string;
    serverVersion: string;
    password: string;
    host: { name: string };
    guest: { name: string };
    items: SyncPlayItem[];
  };
  if (new URL(local.url).hostname !== "127.0.0.1") {
    throw new Error(
      "Local test server required; set E2E_BENCH_CONFIG to use a bench server",
    );
  }
  return {
    source: "local",
    url: local.url,
    serverVersion: local.serverVersion,
    host: { name: local.host.name, password: local.password },
    guest: { name: local.guest.name, password: local.password },
    items: local.items,
  };
};

/**
 * The harness creates a restricted account with the host and deletes it at the end,
 * which Jellyfin only allows an administrator to do; a plain account fails late, on
 * `POST /Users/New`, after the group steps already ran.
 */
export const assertCanManageUsers = (
  user: { Policy?: { IsAdministrator?: boolean | null } | null },
  profile: string,
): void => {
  if (user.Policy?.IsAdministrator) return;
  throw new Error(
    `the "${profile}" account must be an administrator: the harness creates and deletes a restricted account with it`,
  );
};

export const resolveCredentials = (
  env: Env,
  readFile: ReadFile,
  benchDir: string,
  committable: (path: string) => boolean = gitCommittable(
    resolve(benchDir, "../../.."),
  ),
): Promise<SyncPlayCredentials> =>
  env.E2E_BENCH_CONFIG
    ? fromBench(env, readFile, committable)
    : fromLocal(readFile, benchDir);
