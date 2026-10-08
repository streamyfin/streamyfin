jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("./log", () => ({ logAndCaptureError: jest.fn() }));

import { clearMmkv } from "@/test-utils/mmkv";
import { clearSecureStore, secureStoreValues } from "@/test-utils/secureStore";
import { storage } from "@/utils/mmkv";
import {
  credentialKey,
  getAccountCredential,
  getCredentialOrForgetAccount,
  getPreviousServers,
  getServerCustomHeaders,
  getServerLocalConfig,
  renameSavedServer,
  type ServerCredential,
  saveAccountCredential,
  updateServerCustomHeaders,
  updateServerLocalConfig,
} from "./secureCredentials";
import { getSeerrPassword, saveSeerrPassword } from "./seerrPassword";

const SERVER = "https://jellyfin.example.com";

const credential = (userId: string): ServerCredential => ({
  serverUrl: SERVER,
  serverName: "Home",
  token: `token-${userId}`,
  userId,
  username: `user-${userId}`,
  savedAt: 1,
  securityType: "none",
});

const listedAccounts = () =>
  getPreviousServers()
    .find((server) => server.address === SERVER)
    ?.accounts?.map((account) => account.userId);

beforeEach(() => {
  clearMmkv();
  clearSecureStore();
});

describe("getCredentialOrForgetAccount", () => {
  test("hands back the credential of a saved account", async () => {
    await saveAccountCredential(credential("a"));

    expect(await getCredentialOrForgetAccount(SERVER, "a")).toMatchObject({
      token: "token-a",
    });
    expect(listedAccounts()).toEqual(["a"]);
  });

  // REACT-NATIVE-2K: the account was on the list, its credential was not in
  // the keychain, and every attempt to pick it failed with "No saved
  // credential found" while the tile stayed where it was.
  test("forgets an account that is listed without a credential", async () => {
    await saveAccountCredential(credential("a"));
    await saveAccountCredential(credential("b"));
    secureStoreValues.delete(credentialKey(SERVER, "a"));

    expect(await getCredentialOrForgetAccount(SERVER, "a")).toBeNull();
    expect(listedAccounts()).toEqual(["b"]);
  });
});

// Jellyfin 12 stopped answering under /emby, so a server saved with that
// suffix has to move to its root address, with everything saved under it.
describe("renameSavedServer", () => {
  const OLD = "https://jellyfin.example.com/emby";
  const NEW = "https://jellyfin.example.com";

  const saved = (userId: string, extra: Partial<ServerCredential> = {}) =>
    saveAccountCredential({
      ...credential(userId),
      serverUrl: OLD,
      ...extra,
    });
  const addresses = () => getPreviousServers().map((server) => server.address);
  /** Lets the fire-and-forget keychain deletes of the header values land. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  test("moves the accounts with their credentials and their protection", async () => {
    await saved("a", { securityType: "pin", pinHash: "hash-a" });
    await saved("b");

    await renameSavedServer(OLD, NEW);

    expect(addresses()).toEqual([NEW]);
    expect(
      getPreviousServers()[0].accounts.map((account) => [
        account.userId,
        account.securityType,
      ]),
    ).toEqual([
      ["a", "pin"],
      ["b", "none"],
    ]);
    // A PIN that did not come along would leave the account open.
    expect(await getAccountCredential(NEW, "a")).toMatchObject({
      serverUrl: NEW,
      token: "token-a",
      securityType: "pin",
      pinHash: "hash-a",
    });
    expect(await getAccountCredential(NEW, "b")).toMatchObject({
      serverUrl: NEW,
      token: "token-b",
    });
    expect(await getAccountCredential(OLD, "a")).toBeNull();
    expect(await getAccountCredential(OLD, "b")).toBeNull();
  });

  test("keeps the name, the local network setup and the custom headers", async () => {
    await saved("a");
    const localNetworkConfig = {
      localUrl: "http://192.168.1.10:8096",
      homeWifiSSIDs: ["Home"],
      enabled: true,
    };
    updateServerLocalConfig(OLD, localNetworkConfig);
    updateServerCustomHeaders(OLD, [
      { key: "CF-Access-Client-Secret", value: "s3cret", enabled: true },
    ]);
    const oldValueKeys = [...secureStoreValues.keys()].filter((key) =>
      key.startsWith("custom_header_value_"),
    );
    expect(oldValueKeys).toHaveLength(1);

    await renameSavedServer(OLD, NEW);
    await settle();

    expect(getPreviousServers()[0].name).toBe("Home");
    expect(getServerLocalConfig(NEW)).toEqual(localNetworkConfig);
    expect(getServerCustomHeaders(NEW)).toEqual([
      expect.objectContaining({
        key: "CF-Access-Client-Secret",
        value: "s3cret",
        enabled: true,
      }),
    ]);
    // The value lives under the new address now, and only there.
    expect(secureStoreValues.has(oldValueKeys[0])).toBe(false);
  });

  test("moves the password Seerr signs in with", async () => {
    await saved("a");
    await saveSeerrPassword(OLD, "a", "hunter2");

    await renameSavedServer(OLD, NEW);

    expect(await getSeerrPassword(NEW, "a")).toBe("hunter2");
    expect(await getSeerrPassword(OLD, "a")).toBeNull();
  });

  // The probe that finds the root address saves the headers it got through
  // with under it, so an entry can be there already, without accounts.
  test("merges into an entry the new address already has", async () => {
    await saved("a");
    updateServerCustomHeaders(OLD, [
      { key: "X-Gateway", value: "old", enabled: true },
    ]);
    updateServerCustomHeaders(NEW, [
      { key: "X-Gateway", value: "new", enabled: true },
    ]);
    await saveAccountCredential({
      ...credential("b"),
      serverUrl: NEW,
    });

    await renameSavedServer(OLD, NEW);

    expect(addresses()).toEqual([NEW]);
    expect(
      getPreviousServers()[0]
        .accounts.map((account) => account.userId)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(getServerCustomHeaders(NEW)).toEqual([
      expect.objectContaining({ key: "X-Gateway", value: "new" }),
    ]);
  });

  test("keeps the fresher credential when the account is saved under both", async () => {
    await saved("a", { token: "stale", savedAt: 1 });
    await saveAccountCredential({
      ...credential("a"),
      serverUrl: NEW,
      token: "fresh",
      savedAt: 2,
    });

    await renameSavedServer(OLD, NEW);

    expect(await getAccountCredential(NEW, "a")).toMatchObject({
      token: "fresh",
    });
    expect(getPreviousServers()[0].accounts).toEqual([
      expect.objectContaining({ userId: "a", savedAt: 2 }),
    ]);
  });

  // The same account saved under both addresses, protected under one only.
  // Keeping the fresher of the two as it was would have taken the PIN off.
  test.each<["old" | "new"]>([["old"], ["new"]])(
    "keeps the PIN an account has under the %s address only",
    async (protectedUnder) => {
      const pin = { securityType: "pin" as const, pinHash: "hash-a" };
      await saved("a", {
        token: "old-token",
        savedAt: protectedUnder === "old" ? 1 : 2,
        ...(protectedUnder === "old" ? pin : {}),
      });
      await saveAccountCredential({
        ...credential("a"),
        serverUrl: NEW,
        token: "new-token",
        savedAt: protectedUnder === "old" ? 2 : 1,
        ...(protectedUnder === "new" ? pin : {}),
      });

      await renameSavedServer(OLD, NEW);

      // The fresher token, and the protection either way.
      expect(await getAccountCredential(NEW, "a")).toMatchObject({
        token: protectedUnder === "old" ? "new-token" : "old-token",
        securityType: "pin",
        pinHash: "hash-a",
      });
      expect(getPreviousServers()[0].accounts).toEqual([
        expect.objectContaining({ userId: "a", securityType: "pin" }),
      ]);
    },
  );

  // The sign-in screen asks for the PIN when the list says so, and signs in
  // with the credential: a list entry that says "none" for a credential that
  // has a PIN would let the prompt be skipped.
  test("lists an account with the protection its credential has", async () => {
    await saved("a", { securityType: "pin", pinHash: "hash-a" });
    const servers = getPreviousServers();
    servers[0].accounts[0].securityType = "none";
    storage.set("previousServers", JSON.stringify(servers));

    await renameSavedServer(OLD, NEW);

    expect(getPreviousServers()[0].accounts).toEqual([
      expect.objectContaining({ userId: "a", securityType: "pin" }),
    ]);
  });

  // The app was closed between the keychain writes and the list write: the
  // old entry is still listed, one credential has already moved.
  test("finishes a move that was cut short", async () => {
    await saved("a");
    await saved("b");
    secureStoreValues.set(
      credentialKey(NEW, "a"),
      JSON.stringify({ ...credential("a"), serverUrl: NEW }),
    );
    secureStoreValues.delete(credentialKey(OLD, "a"));

    await renameSavedServer(OLD, NEW);

    expect(addresses()).toEqual([NEW]);
    expect(await getAccountCredential(NEW, "a")).toMatchObject({
      token: "token-a",
    });
    expect(await getAccountCredential(NEW, "b")).toMatchObject({
      token: "token-b",
    });
    expect(
      getPreviousServers()[0]
        .accounts.map((account) => account.userId)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  test("leaves the other servers and their order alone", async () => {
    await saveAccountCredential({
      ...credential("x"),
      serverUrl: "https://first.example.com",
    });
    await saved("a");
    await saveAccountCredential({
      ...credential("y"),
      serverUrl: "https://last.example.com",
    });

    await renameSavedServer(OLD, NEW);

    expect(addresses()).toEqual([
      "https://first.example.com",
      NEW,
      "https://last.example.com",
    ]);
    expect(
      await getAccountCredential("https://first.example.com", "x"),
    ).toMatchObject({ token: "token-x" });
  });

  test("does nothing for an address nothing is saved under", async () => {
    await saveAccountCredential({ ...credential("a"), serverUrl: NEW });
    const before = getPreviousServers();

    await renameSavedServer(OLD, NEW);
    await renameSavedServer(NEW, NEW);

    expect(getPreviousServers()).toEqual(before);
    expect(await getAccountCredential(NEW, "a")).toMatchObject({
      token: "token-a",
    });
  });
});
