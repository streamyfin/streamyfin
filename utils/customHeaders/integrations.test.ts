import { clearMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";
import {
  clearSecureStore,
  lockSecureStore,
  secureStoreValues,
  storeAsAnEarlierBuildDid,
} from "@/test-utils/secureStore";
import { storage } from "@/utils/mmkv";
import {
  getIntegrationHeaderConfig,
  updateIntegrationHeaderConfig,
} from "./integrations";
import { secureCustomHeaderMetadata } from "./secureValues";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// the modules under test call.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
}));

const header = (key: string, value: string) => ({ key, value, enabled: true });

/** What a build from before the rename left on the device for Seerr. */
const storedByAnEarlierBuild = () => {
  const customHeaders = secureCustomHeaderMetadata(
    "integration:jellyseerr",
    [header("CF-Access-Client-Secret", "secret")],
    [],
  );
  storage.set(
    "custom_headers_config_jellyseerr",
    JSON.stringify({ source: "custom", customHeaders }),
  );
  storeAsAnEarlierBuildDid();
};

describe("Seerr's custom headers", () => {
  beforeEach(() => {
    clearMmkv();
    clearSecureStore();
    stubReactNative();
  });

  // Seerr's headers were filed under "jellyseerr" before the rename. Looking
  // for them under "seerr" alone would find nothing, and a gateway in front of
  // Seerr would refuse every request after the update.
  test("moves what an earlier build stored, secret included", () => {
    storedByAnEarlierBuild();

    expect(getIntegrationHeaderConfig("seerr")).toEqual({
      source: "custom",
      customHeaders: [
        expect.objectContaining({
          key: "CF-Access-Client-Secret",
          value: "secret",
        }),
      ],
    });
    expect(
      storage.getString("custom_headers_config_jellyseerr"),
    ).toBeUndefined();
    expect(storage.getString("custom_headers_config_seerr")).toBeDefined();
    expect(secureStoreValues.size).toBe(1);
  });

  // The move copies the values and deletes the originals. Run on a locked
  // phone it would copy the empty strings that stand in for what the Keychain
  // refused, and delete the only copy of the secret.
  test("leaves them where they are while the phone is locked", () => {
    storedByAnEarlierBuild();
    lockSecureStore();

    expect(getIntegrationHeaderConfig("seerr")).toEqual({
      source: "none",
      customHeaders: [],
    });
    expect(storage.getString("custom_headers_config_jellyseerr")).toBeDefined();
    expect(storage.getString("custom_headers_config_seerr")).toBeUndefined();
    expect([...secureStoreValues.values()]).toEqual(["secret"]);

    lockSecureStore(false);

    expect(getIntegrationHeaderConfig("seerr").customHeaders).toEqual([
      expect.objectContaining({ value: "secret" }),
    ]);
    expect(
      storage.getString("custom_headers_config_jellyseerr"),
    ).toBeUndefined();
  });

  test("saves under the new name, leaving nothing under the old one", () => {
    storedByAnEarlierBuild();

    updateIntegrationHeaderConfig("seerr", {
      source: "none",
      customHeaders: [],
    });

    expect(
      storage.getString("custom_headers_config_jellyseerr"),
    ).toBeUndefined();
    expect(
      JSON.parse(storage.getString("custom_headers_config_seerr") ?? "{}"),
    ).toEqual({ source: "none", customHeaders: [] });
    expect(secureStoreValues.size).toBe(0);
  });

  test("files the other integrations under their own names", () => {
    updateIntegrationHeaderConfig("streamystats", {
      source: "jellyfin",
      customHeaders: [],
    });

    expect(
      storage.getString("custom_headers_config_streamystats"),
    ).toBeDefined();
  });
});
