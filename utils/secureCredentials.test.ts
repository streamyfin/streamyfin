import { beforeEach, describe, expect, mock, test } from "bun:test";

import { logMock } from "./testing/logMock";
import { mmkvMock, mmkvStore } from "./testing/mmkvMock";

mock.module("@/utils/log", logMock);
mock.module("react-native-mmkv", mmkvMock);

import { secureStoreMock, secureStoreValues } from "./testing/secureStoreMock";

mock.module("expo-secure-store", secureStoreMock);

let uuidCounter = 0;
mock.module("expo-crypto", () => ({
  randomUUID: () => `uuid-${++uuidCounter}`,
  digestStringAsync: async (_algo: string, value: string) => `hash(${value})`,
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

const {
  resolveDeviceIdForLogin,
  migrateCurrentAccountDeviceId,
  saveAccountCredential,
  getAccountCredential,
  getPreviousServers,
  recordAccountSignIn,
  updateAccountToken,
} = await import("./secureCredentials");
const { storage } = await import("./mmkv");

const SERVER = "https://jf.example.com";

const accountsOf = (serverUrl = SERVER) =>
  getPreviousServers().find((s) => s.address === serverUrl)?.accounts ?? [];

const seed = async (
  username: string,
  userId: string,
  deviceId?: string,
  serverUrl = SERVER,
) => {
  await saveAccountCredential({
    serverUrl,
    serverName: "Test",
    token: `token-${userId}`,
    userId,
    username,
    savedAt: 1,
    securityType: "none",
    deviceId,
  });
};

beforeEach(() => {
  mmkvStore.clear();
  storage.remove("previousServers");
  secureStoreValues.clear();
  uuidCounter = 0;
});

describe("resolveDeviceIdForLogin", () => {
  test("mints a fresh id when the username is unknown", () => {
    expect(resolveDeviceIdForLogin(SERVER, "alice")).toBe("uuid-1");
  });

  test("mints a distinct id per unknown user, so tokens never collide", () => {
    const a = resolveDeviceIdForLogin(SERVER, "alice");
    const b = resolveDeviceIdForLogin(SERVER, "anna");
    expect(a).not.toBe(b);
  });

  test("reuses the stored id when the account is already known", async () => {
    await seed("alice", "u1", "device-alice");
    expect(resolveDeviceIdForLogin(SERVER, "alice")).toBe("device-alice");
  });

  test("matches the username case-insensitively", async () => {
    // Jellyfin accepts any casing at login; a case-only difference must not
    // mint a second device id, which would revoke the account's own token.
    await seed("Alice", "u1", "device-alice");
    expect(resolveDeviceIdForLogin(SERVER, "alice")).toBe("device-alice");
  });

  test("mints a fresh id for a known account that predates the migration", async () => {
    // Pre-upgrade accounts have no deviceId. Only one of them can own the
    // legacy install-wide id, so the rest re-authenticate onto their own.
    await seed("alice", "u1", undefined);
    expect(resolveDeviceIdForLogin(SERVER, "alice")).toBe("uuid-1");
  });

  test("matches a saved address that carries a trailing slash", async () => {
    // previousServers holds whatever the user typed; the login passes the
    // SDK's basePath, which drops it. An exact match would mint a second id.
    await seed("alice", "u1", "device-alice", `${SERVER}/`);
    expect(resolveDeviceIdForLogin(SERVER, "alice")).toBe("device-alice");
  });

  test("matches when the login url is the one carrying the slash", async () => {
    await seed("alice", "u1", "device-alice");
    expect(resolveDeviceIdForLogin(`${SERVER}/`, "alice")).toBe("device-alice");
  });

  test("does not share an id across servers for the same username", async () => {
    await seed("alice", "u1", "device-alice");
    expect(resolveDeviceIdForLogin("https://other.example.com", "alice")).toBe(
      "uuid-1",
    );
  });
});

describe("migrateCurrentAccountDeviceId", () => {
  test("adopts the legacy install-wide id for the signed-in account", async () => {
    await seed("alice", "u1", undefined);

    await migrateCurrentAccountDeviceId(SERVER, "u1", "legacy-device");

    const credential = await getAccountCredential(SERVER, "u1");
    expect(credential?.deviceId).toBe("legacy-device");
    expect(accountsOf()[0].deviceId).toBe("legacy-device");
  });

  test("leaves other accounts without an id, so they mint their own", async () => {
    await seed("alice", "u1", undefined);
    await seed("anna", "u2", undefined);

    await migrateCurrentAccountDeviceId(SERVER, "u1", "legacy-device");

    const anna = await getAccountCredential(SERVER, "u2");
    expect(anna?.deviceId).toBeUndefined();
  });

  test("never overwrites an id that was already assigned", async () => {
    await seed("alice", "u1", "device-alice");

    await migrateCurrentAccountDeviceId(SERVER, "u1", "legacy-device");

    const credential = await getAccountCredential(SERVER, "u1");
    expect(credential?.deviceId).toBe("device-alice");
  });

  test("is a no-op when the account was never saved", async () => {
    await migrateCurrentAccountDeviceId(SERVER, "unknown", "legacy-device");
    expect(accountsOf()).toEqual([]);
  });

  test("declines an id another account already owns", async () => {
    // Otherwise the migration hands two accounts the same device, recreating
    // the collision this mechanism exists to prevent.
    await seed("alice", "u1", "legacy-device");
    await seed("bob", "u2", undefined);

    await migrateCurrentAccountDeviceId(SERVER, "u2", "legacy-device");

    expect(
      (await getAccountCredential(SERVER, "u2"))?.deviceId,
    ).toBeUndefined();
  });

  test("still stamps when the mirror already shows this account's own id", async () => {
    // The claimed scan must skip the account being migrated: if the summary
    // and the credential ever disagree, it would refuse to stamp its owner.
    await seed("alice", "u1", undefined);
    const servers = getPreviousServers();
    servers[0].accounts[0].deviceId = "legacy-device";
    storage.set("previousServers", JSON.stringify(servers));

    await migrateCurrentAccountDeviceId(SERVER, "u1", "legacy-device");

    expect((await getAccountCredential(SERVER, "u1"))?.deviceId).toBe(
      "legacy-device",
    );
  });

  test("declines an id owned on a different server", async () => {
    // The legacy id is install-wide, so its owner can sit under any server.
    await seed("alice", "u1", "legacy-device", "https://other.example.com");
    await seed("bob", "u2", undefined);

    await migrateCurrentAccountDeviceId(SERVER, "u2", "legacy-device");

    expect(
      (await getAccountCredential(SERVER, "u2"))?.deviceId,
    ).toBeUndefined();
  });
});

describe("updateAccountToken", () => {
  test("rebinds the account to the id the new token was issued under", async () => {
    // Quick Connect mints an id before knowing who will approve it, so the
    // account has to move onto that id or its requests go out on a stale one.
    await seed("alice", "u1", "device-alice");

    await updateAccountToken(SERVER, "u1", "fresh-token", undefined, "qc-id");

    const credential = await getAccountCredential(SERVER, "u1");
    expect(credential?.token).toBe("fresh-token");
    expect(credential?.deviceId).toBe("qc-id");
    expect(accountsOf()[0].deviceId).toBe("qc-id");
  });

  test("keeps the existing id when none is supplied", async () => {
    await seed("alice", "u1", "device-alice");

    await updateAccountToken(SERVER, "u1", "fresh-token");

    expect((await getAccountCredential(SERVER, "u1"))?.deviceId).toBe(
      "device-alice",
    );
  });
});

describe("recordAccountSignIn", () => {
  const signIn = (
    userId: string,
    username: string,
    deviceId: string,
    saveIfNew = true,
  ) =>
    recordAccountSignIn({
      serverUrl: SERVER,
      userId,
      username,
      token: `token-${userId}`,
      deviceId,
      saveIfNew,
      primaryImageTag: "tag",
    });

  test("saves an account signing in for the first time", async () => {
    // Quick Connect has no save step, so an unknown approver would otherwise
    // authenticate and never appear in the switcher.
    await signIn("u1", "alice", "device-alice");

    const credential = await getAccountCredential(SERVER, "u1");
    expect(credential?.username).toBe("alice");
    expect(credential?.deviceId).toBe("device-alice");
    expect(accountsOf()).toHaveLength(1);
  });

  test("defaults a newly saved account to no protection", async () => {
    // Quick Connect is itself an approval from a signed-in device.
    await signIn("u1", "alice", "device-alice");

    expect((await getAccountCredential(SERVER, "u1"))?.securityType).toBe(
      "none",
    );
  });

  test("refreshes a known account rather than duplicating it", async () => {
    // Seeded with a token signIn does not write, so the assertion below fails
    // if the refresh never happens.
    await saveAccountCredential({
      serverUrl: SERVER,
      serverName: "Test",
      token: "stale-token",
      userId: "u1",
      username: "alice",
      savedAt: 1,
      securityType: "none",
      deviceId: "device-alice",
    });

    await signIn("u1", "alice", "device-alice");

    expect(accountsOf()).toHaveLength(1);
    expect((await getAccountCredential(SERVER, "u1"))?.token).toBe("token-u1");
  });

  test("preserves a known account's protection choice", async () => {
    // Re-authenticating must not silently downgrade a PIN-protected account.
    await saveAccountCredential({
      serverUrl: SERVER,
      serverName: "Test",
      token: "old",
      userId: "u1",
      username: "alice",
      savedAt: 1,
      securityType: "pin",
      pinHash: "hash",
      deviceId: "device-alice",
    });

    await signIn("u1", "alice", "device-alice");

    const credential = await getAccountCredential(SERVER, "u1");
    expect(credential?.securityType).toBe("pin");
    expect(credential?.pinHash).toBe("hash");
  });

  test("leaves an unknown account unsaved when saving was not asked for", async () => {
    // Consent lives with the caller: a Quick Connect sign-in on a shared phone
    // must not persist a token the user declined to save.
    await signIn("u1", "alice", "device-alice", false);

    expect(await getAccountCredential(SERVER, "u1")).toBeNull();
    expect(accountsOf()).toEqual([]);
  });

  test("still refreshes a known account when saving was not asked for", async () => {
    // The stored token was rejected; without this the account can never be
    // revived and its switcher entry stays dead.
    await saveAccountCredential({
      serverUrl: SERVER,
      serverName: "Test",
      token: "stale-token",
      userId: "u1",
      username: "alice",
      savedAt: 1,
      securityType: "none",
      deviceId: "device-alice",
    });

    await signIn("u1", "alice", "fresh-device", false);

    const credential = await getAccountCredential(SERVER, "u1");
    expect(credential?.token).toBe("token-u1");
    expect(credential?.deviceId).toBe("fresh-device");
  });

  test("keeps accounts separate when a second user signs in", async () => {
    await signIn("u1", "alice", "device-alice");
    await signIn("u2", "bob", "device-bob");

    expect(accountsOf()).toHaveLength(2);
    expect((await getAccountCredential(SERVER, "u2"))?.deviceId).toBe(
      "device-bob",
    );
    expect((await getAccountCredential(SERVER, "u1"))?.deviceId).toBe(
      "device-alice",
    );
  });
});
