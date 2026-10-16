import { clearMmkv } from "@/test-utils/mmkv";
import {
  clearSecureStore,
  lockSecureStore,
  secureStoreValues,
} from "@/test-utils/secureStore";
import { storage } from "@/utils/mmkv";
import {
  getIntegrationHeaderConfig,
  makeIntegrationHeadersReadableWhileLocked,
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
};

describe("Seerr's custom headers", () => {
  beforeEach(() => {
    clearMmkv();
    clearSecureStore();
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

// See `makeServerHeadersReadableWhileLocked`: the same move, for the headers
// an integration has of its own.
describe("makeIntegrationHeadersReadableWhileLocked", () => {
  const LEGACY_KEY = "custom_header_value_aW50ZWdyYXRpb24_0";

  const storedByAnEarlierBuild = () => {
    storage.set(
      "custom_headers_config_streamystats",
      JSON.stringify({
        source: "custom",
        customHeaders: [
          {
            key: "X-Gateway",
            value: "",
            enabled: true,
            secureValueKey: LEGACY_KEY,
          },
        ],
      }),
    );
    secureStoreValues.set(LEGACY_KEY, "secret");
  };

  beforeEach(() => {
    clearMmkv();
    clearSecureStore();
  });

  test("makes a value from an earlier build readable on a locked phone", async () => {
    storedByAnEarlierBuild();

    makeIntegrationHeadersReadableWhileLocked();
    // The old item is removed asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 0));

    lockSecureStore();
    expect(getIntegrationHeaderConfig("streamystats")).toEqual({
      source: "custom",
      customHeaders: [
        expect.objectContaining({ key: "X-Gateway", value: "secret" }),
      ],
    });
    expect([...secureStoreValues.keys()]).not.toContain(LEGACY_KEY);
  });

  test("leaves an integration with nothing to move as it is", () => {
    updateIntegrationHeaderConfig("marlin", {
      source: "jellyfin",
      customHeaders: [],
    });
    const config = storage.getString("custom_headers_config_marlin");

    makeIntegrationHeadersReadableWhileLocked();

    expect(storage.getString("custom_headers_config_marlin")).toBe(config);
  });
});
