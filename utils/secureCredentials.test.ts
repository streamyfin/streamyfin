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
import {
  credentialKey,
  getCredentialOrForgetAccount,
  getPreviousServers,
  type ServerCredential,
  saveAccountCredential,
} from "./secureCredentials";

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
