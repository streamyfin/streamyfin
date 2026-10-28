/**
 * Where the SyncPlay harness gets its server and accounts.
 *
 * By default it uses the throwaway Docker server that setup.py starts and refuses any other
 * host. With E2E_BENCH_CONFIG set, it takes a server of the shared bench configuration and
 * its `syncplay-host` / `syncplay-guest` accounts, and the media items are resolved later by
 * lab code against that server.
 */

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

const fromBench = async (
  env: Env,
  readFile: ReadFile,
): Promise<SyncPlayCredentials> => {
  const config = JSON.parse(
    await readFile(env.E2E_BENCH_CONFIG as string),
  ) as BenchConfig;
  const server = env.E2E_BENCH_SERVER ?? DEFAULT_BENCH_SERVER;
  if (!config.servers[server]) {
    throw new Error(
      `bench config has no server ${server}; known: ${Object.keys(config.servers).join(", ")}`,
    );
  }
  const codes = env.E2E_SYNCPLAY_ITEMS?.split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  return {
    source: "bench",
    url: config.servers[server].url.replace(/\/$/, ""),
    host: benchAccount(config, server, HOST_PROFILE),
    guest: benchAccount(config, server, GUEST_PROFILE),
    itemCodes: codes?.length ? codes : DEFAULT_ITEM_CODES,
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

export const resolveCredentials = (
  env: Env,
  readFile: ReadFile,
  benchDir: string,
): Promise<SyncPlayCredentials> =>
  env.E2E_BENCH_CONFIG
    ? fromBench(env, readFile)
    : fromLocal(readFile, benchDir);
