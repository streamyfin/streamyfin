jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The barrel re-exports modules with native dependencies; the spec needs the
// pure helpers only.
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
// The log module reaches Sentry.
jest.mock("@/utils/log", () => ({
  writeToLog: jest.fn(),
  writeInfoLog: jest.fn(),
  logAndCaptureError: jest.fn(),
}));

import { clearMmkv } from "@/test-utils/mmkv";
import { clearSecureStore } from "@/test-utils/secureStore";
import {
  getAccountCredential,
  getPreviousServers,
  saveAccountCredential,
} from "@/utils/secureCredentials";
import {
  hasLegacyRoutePrefix,
  migrateLegacyServerAddress,
} from "./legacyServerAddress";

const OLD = "https://jellyfin.example.com/emby";
const NEW = "https://jellyfin.example.com";
const INFO = "/System/Info/Public";

type Answer = Record<string, unknown> | number | "unreachable";

let fetched: string[] = [];
let answers: Record<string, Answer> = {};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string) => {
  fetched.push(url);
  const answer = answers[url] ?? "unreachable";
  if (answer === "unreachable") throw new TypeError("Network request failed");
  if (typeof answer === "number") {
    return { ok: false, status: answer, json: async () => ({}) };
  }
  return { ok: true, status: 200, json: async () => answer };
}) as unknown as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
});

const jellyfin = (id: string, version = "12.0.0") => ({
  Id: id,
  Version: version,
  ServerName: "Home",
  ProductName: "Jellyfin Server",
});

const saveAccount = () =>
  saveAccountCredential({
    serverUrl: OLD,
    serverName: "Home",
    token: "token-a",
    userId: "a",
    username: "user-a",
    savedAt: 1,
    securityType: "pin",
    pinHash: "hash-a",
  });

const addresses = () => getPreviousServers().map((server) => server.address);

beforeEach(async () => {
  clearMmkv();
  clearSecureStore();
  fetched = [];
  answers = {};
  await saveAccount();
});

describe("hasLegacyRoutePrefix", () => {
  test("only an address ending in a removed alias has one", () => {
    expect(hasLegacyRoutePrefix(OLD)).toBe(true);
    expect(hasLegacyRoutePrefix("http://192.168.1.2:8096/mediabrowser")).toBe(
      true,
    );
    expect(hasLegacyRoutePrefix(NEW)).toBe(false);
    // A host that happens to be called emby is not a prefix.
    expect(hasLegacyRoutePrefix("https://emby")).toBe(false);
  });
});

describe("migrateLegacyServerAddress", () => {
  // The case this exists for: the server was upgraded, the address the app
  // has saved answers nothing any more, and every request the app made
  // failed until the user removed the server and typed it in again.
  test("moves a saved server once Jellyfin 12 stopped answering under the prefix", async () => {
    answers = {
      [`${NEW}${INFO}`]: jellyfin("server-1"),
      [`${OLD}${INFO}`]: 404,
    };

    expect(
      await migrateLegacyServerAddress(OLD, { expectedServerId: "server-1" }),
    ).toBe(NEW);

    expect(addresses()).toEqual([NEW]);
    expect(await getAccountCredential(NEW, "a")).toMatchObject({
      serverUrl: NEW,
      token: "token-a",
      securityType: "pin",
      pinHash: "hash-a",
    });
    expect(await getAccountCredential(OLD, "a")).toBeNull();
  });

  // Up to 10.11 a server answers at both, so the move can happen before the
  // upgrade that would break the saved address.
  test("moves ahead of the upgrade when both addresses are the same server", async () => {
    answers = {
      [`${NEW}${INFO}`]: jellyfin("server-1", "10.11.0"),
      [`${OLD}${INFO}`]: jellyfin("server-1", "10.11.0"),
    };

    expect(await migrateLegacyServerAddress(OLD)).toBe(NEW);
    expect(addresses()).toEqual([NEW]);
  });

  // A proxy can forward the prefixed path to Jellyfin and serve something
  // else, or nothing, at the root: the saved address is then the right one.
  test.each<[string, Answer]>([
    ["nothing", 404],
    ["another service", { ProductName: "Something Else", Version: "1.0" }],
  ])(
    "leaves the address alone when the root serves %s",
    async (_what, root) => {
      answers = {
        [`${NEW}${INFO}`]: root,
        [`${OLD}${INFO}`]: jellyfin("server-1", "10.11.0"),
      };

      expect(await migrateLegacyServerAddress(OLD)).toBeNull();

      expect(addresses()).toEqual([OLD]);
      expect(await getAccountCredential(OLD, "a")).toMatchObject({
        token: "token-a",
      });
    },
  );

  // Two servers behind one host: the accounts of one must not be moved onto
  // the other, where their tokens mean nothing.
  test("leaves the address alone when the root is another Jellyfin server", async () => {
    answers = {
      [`${NEW}${INFO}`]: jellyfin("server-2"),
      [`${OLD}${INFO}`]: jellyfin("server-1", "10.11.0"),
    };

    expect(await migrateLegacyServerAddress(OLD)).toBeNull();

    expect(addresses()).toEqual([OLD]);
    expect(await getAccountCredential(OLD, "a")).not.toBeNull();
  });

  // The session knows which server it signed in to, so a root that is some
  // other Jellyfin server is refused even when the saved address is silent.
  test("leaves the address alone when the root is not the server signed in to", async () => {
    answers = {
      [`${NEW}${INFO}`]: jellyfin("server-2"),
      [`${OLD}${INFO}`]: 404,
    };

    expect(
      await migrateLegacyServerAddress(OLD, { expectedServerId: "server-1" }),
    ).toBeNull();

    expect(addresses()).toEqual([OLD]);
    expect(await getAccountCredential(OLD, "a")).not.toBeNull();
  });

  // Nothing says which server the address was saved for: the saved address
  // answers nothing any more and the caller has no id. A Jellyfin server at
  // the root is then not proof enough to hand it the saved tokens.
  test.each<[string, Answer]>([
    ["no longer answers", 404],
    ["cannot be reached", "unreachable"],
  ])(
    "leaves the address alone when the saved one %s and no id is known",
    async (_what, saved) => {
      answers = {
        [`${NEW}${INFO}`]: jellyfin("server-1"),
        [`${OLD}${INFO}`]: saved,
      };

      expect(await migrateLegacyServerAddress(OLD)).toBeNull();

      expect(addresses()).toEqual([OLD]);
      expect(await getAccountCredential(OLD, "a")).not.toBeNull();
    },
  );

  test("leaves the address alone when the root gives no id to compare", async () => {
    answers = {
      [`${NEW}${INFO}`]: { ...jellyfin("server-1"), Id: undefined },
      [`${OLD}${INFO}`]: 404,
    };

    expect(
      await migrateLegacyServerAddress(OLD, { expectedServerId: "server-1" }),
    ).toBeNull();
    expect(addresses()).toEqual([OLD]);
  });

  test("leaves the address alone while the server cannot be reached", async () => {
    expect(await migrateLegacyServerAddress(OLD)).toBeNull();

    expect(addresses()).toEqual([OLD]);
    expect(await getAccountCredential(OLD, "a")).not.toBeNull();
  });

  // Too old a server is reported by throwing, which must not reach the
  // launch that asked.
  test("resolves, without moving, for a server too old to support", async () => {
    answers = {
      [`${NEW}${INFO}`]: jellyfin("server-1", "10.8.0"),
      [`${OLD}${INFO}`]: jellyfin("server-1", "10.8.0"),
    };

    expect(await migrateLegacyServerAddress(OLD)).toBeNull();
    expect(addresses()).toEqual([OLD]);
  });

  test("asks nothing of the network for an address without the prefix", async () => {
    expect(await migrateLegacyServerAddress(NEW)).toBeNull();
    expect(fetched).toEqual([]);
  });

  // The launch and a quick login can both ask for the same server.
  test("runs once for callers that ask at the same time", async () => {
    answers = {
      [`${NEW}${INFO}`]: jellyfin("server-1"),
      [`${OLD}${INFO}`]: 404,
    };

    const [first, second] = await Promise.all([
      migrateLegacyServerAddress(OLD, { expectedServerId: "server-1" }),
      migrateLegacyServerAddress(OLD, { expectedServerId: "server-1" }),
    ]);

    expect([first, second]).toEqual([NEW, NEW]);
    expect(fetched.filter((url) => url === `${NEW}${INFO}`)).toHaveLength(1);
  });

  test("has nothing left to do once the server has moved", async () => {
    answers = {
      [`${NEW}${INFO}`]: jellyfin("server-1"),
      [`${OLD}${INFO}`]: 404,
    };
    await migrateLegacyServerAddress(OLD, { expectedServerId: "server-1" });
    fetched = [];

    expect(await migrateLegacyServerAddress(NEW)).toBeNull();
    expect(fetched).toEqual([]);
    expect(addresses()).toEqual([NEW]);
  });
});
