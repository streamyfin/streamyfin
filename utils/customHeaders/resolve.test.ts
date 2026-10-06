import { clearMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";
import {
  clearSecureStore,
  lockSecureStore,
  storeAsAnEarlierBuildDid,
} from "@/test-utils/secureStore";
import { storage } from "@/utils/mmkv";
import { updateServerCustomHeaders } from "@/utils/secureCredentials";
import { updateIntegrationHeaderConfig } from "./integrations";
import {
  getHeadersForUrl,
  getIntegrationHeaders,
  getJellyfinHeaders,
} from "./resolve";
import { bumpCustomHeadersVersion } from "./secureValues";
import { headersUnreadable } from "./unreadable";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
// The real log loads Sentry, whose timers keep Jest from exiting.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: () => undefined,
}));

const SERVER = "https://jellyfin.example";
const SECRET = { "CF-Access-Client-Secret": "secret" };

const header = (key: string, value: string) => ({ key, value, enabled: true });

/** The gateway headers of `SERVER`, as a build from before the fix kept them. */
const jellyfinHeadersFromAnEarlierBuild = () => {
  updateServerCustomHeaders(SERVER, [
    header("CF-Access-Client-Secret", "secret"),
  ]);
  storeAsAnEarlierBuildDid();
};

// iOS launches the app in the background while the phone is locked, and the
// Keychain refuses the stored values until it is unlocked (Sentry
// REACT-NATIVE-16, REACT-NATIVE-AA).
describe("headers whose values cannot be read", () => {
  beforeEach(() => {
    clearMmkv();
    clearSecureStore();
    stubReactNative();
    storage.set("serverUrl", SERVER);
    // The stores were emptied behind the resolver's back; this is how it is
    // told to forget what it read for the previous test.
    bumpCustomHeadersVersion();
  });

  test("come back empty, and marked as unreadable", () => {
    jellyfinHeadersFromAnEarlierBuild();
    lockSecureStore();

    const headers = getJellyfinHeaders(SERVER);

    expect(headers).toEqual({});
    expect(headersUnreadable(headers)).toBe(true);
  });

  // The cache lasts until the configuration changes, and unlocking the phone
  // changes none of it: a remembered empty answer would send every request
  // past the user's gateway without its header until the app is restarted.
  test("are not remembered: unlocking the phone is enough to get them", () => {
    jellyfinHeadersFromAnEarlierBuild();
    lockSecureStore();
    getJellyfinHeaders(SERVER);

    lockSecureStore(false);

    expect(getJellyfinHeaders(SERVER)).toEqual(SECRET);
    expect(headersUnreadable(getJellyfinHeaders(SERVER))).toBe(false);
  });

  // Half of a gateway's credentials open nothing, and would only tell the
  // gateway which half the app holds.
  test("are all withheld when only some of them can be read", () => {
    jellyfinHeadersFromAnEarlierBuild();
    updateServerCustomHeaders(SERVER, [
      header("CF-Access-Client-Secret", "secret"),
      header("CF-Access-Client-Id", "id"),
    ]);
    lockSecureStore();

    const headers = getJellyfinHeaders(SERVER);

    expect(headers).toEqual({});
    expect(headersUnreadable(headers)).toBe(true);
  });

  test("are still remembered once they were read", () => {
    jellyfinHeadersFromAnEarlierBuild();
    const headers = getJellyfinHeaders(SERVER);
    lockSecureStore();

    expect(getJellyfinHeaders(SERVER)).toBe(headers);
    expect(headers).toEqual(SECRET);
  });

  test("leave an integration with its own headers unreadable too", () => {
    updateIntegrationHeaderConfig("streamystats", {
      source: "custom",
      customHeaders: [header("X-Gateway", "secret")],
    });
    storeAsAnEarlierBuildDid();
    lockSecureStore();
    expect(headersUnreadable(getIntegrationHeaders("streamystats"))).toBe(true);

    lockSecureStore(false);

    expect(getIntegrationHeaders("streamystats")).toEqual({
      "X-Gateway": "secret",
    });
  });

  test("leave an integration that borrows the Jellyfin headers unreadable too", () => {
    jellyfinHeadersFromAnEarlierBuild();
    updateIntegrationHeaderConfig("streamystats", {
      source: "jellyfin",
      customHeaders: [],
    });
    lockSecureStore();
    expect(headersUnreadable(getIntegrationHeaders("streamystats"))).toBe(true);

    lockSecureStore(false);

    expect(getIntegrationHeaders("streamystats")).toEqual(SECRET);
  });

  test("put nothing on an image, and the real headers once unlocked", () => {
    jellyfinHeadersFromAnEarlierBuild();
    const poster = `${SERVER}/Items/1/Images/Primary`;
    lockSecureStore();
    expect(
      getHeadersForUrl(poster, { jellyfinBaseUrl: SERVER }),
    ).toBeUndefined();

    lockSecureStore(false);

    expect(getHeadersForUrl(poster, { jellyfinBaseUrl: SERVER })).toEqual(
      SECRET,
    );
  });

  test("are not confused with a server that has none configured", () => {
    lockSecureStore();

    const headers = getJellyfinHeaders(SERVER);

    expect(headers).toEqual({});
    expect(headersUnreadable(headers)).toBe(false);
  });
});
