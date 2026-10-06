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
import {
  clearSecureStore,
  lockSecureStore,
  secureStoreValues,
} from "@/test-utils/secureStore";
import { storage } from "./mmkv";
import {
  credentialKey,
  getCredentialOrForgetAccount,
  getPreviousServers,
  getServerCustomHeaders,
  makeServerHeadersReadableWhileLocked,
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

// iOS can launch the app in the background while the phone is locked, where
// the Keychain refuses what earlier builds stored (Sentry REACT-NATIVE-16,
// REACT-NATIVE-AA). The values are stored again, once, as items that can be
// read there.
describe("makeServerHeadersReadableWhileLocked", () => {
  const LEGACY_KEY = "custom_header_value_c2VydmVy_0";

  /** A server whose gateway secret an earlier build stored. */
  const savedByAnEarlierBuild = async () => {
    await saveAccountCredential(credential("a"));
    const servers = getPreviousServers();
    servers[0].customHeaders = [
      {
        key: "CF-Access-Client-Secret",
        value: "",
        enabled: true,
        secureValueKey: LEGACY_KEY,
      },
    ];
    storage.set("previousServers", JSON.stringify(servers));
    secureStoreValues.set(LEGACY_KEY, "secret");
  };

  /** Lets the removal of the old items, which is asynchronous, finish. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  const secretOnALockedPhone = () => {
    lockSecureStore();
    try {
      return getServerCustomHeaders(SERVER)[0]?.value;
    } finally {
      lockSecureStore(false);
    }
  };

  test("makes a value from an earlier build readable on a locked phone", async () => {
    await savedByAnEarlierBuild();
    expect(secretOnALockedPhone).toThrow("User interaction is not allowed");

    makeServerHeadersReadableWhileLocked();
    await settled();

    expect(secretOnALockedPhone()).toBe("secret");
    // One copy, under the new key, and the rest of the server as it was.
    expect([...secureStoreValues.keys()]).not.toContain(LEGACY_KEY);
    expect(listedAccounts()).toEqual(["a"]);
  });

  test("changes nothing the second time", async () => {
    await savedByAnEarlierBuild();
    makeServerHeadersReadableWhileLocked();
    await settled();
    const servers = storage.getString("previousServers");
    const stored = new Map(secureStoreValues);

    makeServerHeadersReadableWhileLocked();
    await settled();

    expect(storage.getString("previousServers")).toBe(servers);
    expect(new Map(secureStoreValues)).toEqual(stored);
  });

  test("leaves everything in place on a locked phone, for the next launch", async () => {
    await savedByAnEarlierBuild();
    const servers = storage.getString("previousServers");
    lockSecureStore();

    makeServerHeadersReadableWhileLocked();
    await settled();

    expect(storage.getString("previousServers")).toBe(servers);
    expect(secureStoreValues.get(LEGACY_KEY)).toBe("secret");

    lockSecureStore(false);
    makeServerHeadersReadableWhileLocked();
    await settled();

    expect(secretOnALockedPhone()).toBe("secret");
  });

  // The old item goes last. Removed any earlier, a failure to save the rows
  // would leave them pointing at a value that no longer exists.
  test("keeps the old value when the rows pointing at the new one are not saved", async () => {
    await savedByAnEarlierBuild();
    const servers = storage.getString("previousServers");
    const save = jest.spyOn(storage, "set").mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    makeServerHeadersReadableWhileLocked();
    await settled();

    save.mockRestore();
    expect(storage.getString("previousServers")).toBe(servers);
    expect(getServerCustomHeaders(SERVER)[0]?.value).toBe("secret");

    makeServerHeadersReadableWhileLocked();
    await settled();

    expect(secretOnALockedPhone()).toBe("secret");
    expect(secureStoreValues.size).toBe(2);
  });
});
