import { AppState } from "react-native";
import { emitAppState, stubReactNative } from "@/test-utils/reactNative";
import {
  clearSecureStore,
  lockSecureStore,
  secureStoreValues,
  storeAsAnEarlierBuildDid,
} from "@/test-utils/secureStore";
import { store } from "@/utils/store";
import {
  customHeadersVersionAtom,
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
  trackSecureReads,
} from "./secureValues";
import type { CustomHeader } from "./types";

jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
// The real log loads Sentry, whose timers keep Jest from exiting.
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
  logAndCaptureError: (...args: unknown[]) => mockLogAndCaptureError(...args),
}));

const mockWriteToLog = jest.fn();
const mockLogAndCaptureError = jest.fn();

const header = (
  key: string,
  value: string,
  secureValueKey?: string,
): CustomHeader => ({ key, value, enabled: true, secureValueKey });

describe("secureCustomHeaderMetadata", () => {
  beforeEach(() => {
    clearSecureStore();
  });

  test("keeps values out of the persisted metadata", () => {
    const metadata = secureCustomHeaderMetadata("server:https://example.test", [
      header("CF-Access-Client-Id", "id-value"),
    ]);

    expect(metadata[0]?.value).toBe("");
    expect(metadata[0]?.secureValueKey).toBeTruthy();
    expect(secureStoreValues.get(metadata[0]!.secureValueKey!)).toBe(
      "id-value",
    );
    expect(resolveCustomHeaderValues(metadata)[0]?.value).toBe("id-value");
  });

  test("stores an edited value instead of the one it replaces", () => {
    const scope = "server:https://example.test";
    const [stored] = secureCustomHeaderMetadata(scope, [
      header("CF-Access-Client-Secret", "old-secret"),
    ]);

    // What a settings editor holds after the user rotates the secret: the row
    // keeps its secureValueKey but carries the new value.
    const edited = secureCustomHeaderMetadata(
      scope,
      [header("CF-Access-Client-Secret", "new-secret", stored!.secureValueKey)],
      [stored!],
    );

    expect(secureStoreValues.get(edited[0]!.secureValueKey!)).toBe(
      "new-secret",
    );
    expect(resolveCustomHeaderValues(edited)[0]?.value).toBe("new-secret");
  });

  test("deletes values for rows that were removed", () => {
    const scope = "server:https://example.test";
    const original = secureCustomHeaderMetadata(scope, [
      header("X-Removed", "gone"),
      header("X-Kept", "kept"),
    ]);
    const removedKey = original[0]!.secureValueKey!;

    // Callers hand back rows with their values resolved, as the settings UI does.
    const kept = resolveCustomHeaderValues([original[1]!]);
    secureCustomHeaderMetadata(scope, kept, original);

    expect(secureStoreValues.has(removedKey)).toBe(false);
    expect(secureStoreValues.get(original[1]!.secureValueKey!)).toBe("kept");
  });

  test("does not assign a generated key that collides with a retained row", () => {
    const scope = "server:https://example.test";
    const original = secureCustomHeaderMetadata(scope, [
      header("X-First", "first"),
      header("X-Retained", "retained"),
    ]);
    const retainedKey = original[1]?.secureValueKey;

    const metadata = secureCustomHeaderMetadata(
      scope,
      [
        header("X-Retained", "retained-new-value", retainedKey),
        header("X-New", "new-secret"),
      ],
      original,
    );
    const secureValueKeys = metadata.map((item) => item.secureValueKey);

    expect(metadata[0]?.secureValueKey).toBe(retainedKey);
    expect(new Set(secureValueKeys).size).toBe(secureValueKeys.length);
    expect(secureStoreValues.get(metadata[0]!.secureValueKey!)).toBe(
      "retained-new-value",
    );
    expect(secureStoreValues.get(metadata[1]!.secureValueKey!)).toBe(
      "new-secret",
    );
  });

  test("allocates a new key when metadata from another scope is reused", () => {
    const firstMetadata = secureCustomHeaderMetadata(
      "server:https://first.example.test",
      [header("CF-Access-Client-Id", "first-secret")],
    );
    const copiedKey = firstMetadata[0]?.secureValueKey;

    const secondMetadata = secureCustomHeaderMetadata(
      "server:https://second.example.test",
      [header("CF-Access-Client-Id", "second-secret", copiedKey)],
    );

    expect(secondMetadata[0]?.secureValueKey).not.toBe(copiedKey);
    expect(secureStoreValues.get(copiedKey!)).toBe("first-secret");
    expect(secureStoreValues.get(secondMetadata[0]!.secureValueKey!)).toBe(
      "second-secret",
    );
  });

  test("handles a non-ASCII scope", () => {
    const metadata = secureCustomHeaderMetadata("server:https://медиа.test", [
      header("CF-Access-Client-Id", "id-value"),
    ]);

    expect(secureStoreValues.get(metadata[0]!.secureValueKey!)).toBe(
      "id-value",
    );
  });

  test("allocates a new key when encoded scope prefixes overlap", () => {
    const longerScopeMetadata = secureCustomHeaderMetadata("a\x0f\xC0", [
      header("CF-Access-Client-Id", "longer-secret"),
    ]);
    const overlappingKey = longerScopeMetadata[0]?.secureValueKey;

    const shorterScopeMetadata = secureCustomHeaderMetadata("a", [
      header("CF-Access-Client-Id", "shorter-secret", overlappingKey),
    ]);

    expect(shorterScopeMetadata[0]?.secureValueKey).not.toBe(overlappingKey);
    expect(secureStoreValues.get(overlappingKey!)).toBe("longer-secret");
    expect(
      secureStoreValues.get(shorterScopeMetadata[0]!.secureValueKey!),
    ).toBe("shorter-secret");
  });
});

// iOS can launch the app in the background while the phone is locked, and the
// Keychain then refuses every item stored as readable only when unlocked. The
// read used to throw, in the middle of a render: the provider tree never
// mounted on that launch (Sentry REACT-NATIVE-16, REACT-NATIVE-AA).
describe("a header value on a locked phone", () => {
  const scope = "server:https://example.test";
  const appState = (state: string) =>
    Object.defineProperty(AppState, "currentState", {
      value: state,
      configurable: true,
    });

  /** One header whose value was stored by a build from before the fix. */
  const storedByAnEarlierBuild = () => {
    const metadata = secureCustomHeaderMetadata(scope, [
      header("CF-Access-Client-Secret", "secret"),
    ]);
    storeAsAnEarlierBuildDid();
    return metadata;
  };

  beforeEach(() => {
    clearSecureStore();
    stubReactNative();
    appState("background");
    mockWriteToLog.mockClear();
    mockLogAndCaptureError.mockClear();
  });

  // Whatever the previous test left waiting for the foreground is spent here,
  // so each test counts its own announcements only.
  afterEach(() => {
    lockSecureStore(false);
    emitAppState("active");
  });

  test("reads as empty instead of throwing", () => {
    const metadata = storedByAnEarlierBuild();
    lockSecureStore();

    expect(resolveCustomHeaderValues(metadata)[0]?.value).toBe("");
  });

  test("tells the caller that what it got is not the stored value", () => {
    const metadata = storedByAnEarlierBuild();

    lockSecureStore();
    expect(
      trackSecureReads(() => resolveCustomHeaderValues(metadata)).complete,
    ).toBe(false);

    lockSecureStore(false);
    expect(trackSecureReads(() => resolveCustomHeaderValues(metadata))).toEqual(
      {
        value: [expect.objectContaining({ value: "secret" })],
        complete: true,
      },
    );
  });

  test("is read again once the phone is unlocked", () => {
    const metadata = storedByAnEarlierBuild();
    lockSecureStore();
    resolveCustomHeaderValues(metadata);

    lockSecureStore(false);

    expect(resolveCustomHeaderValues(metadata)[0]?.value).toBe("secret");
  });

  // Clients and image sources memoize on the version, so the empty headers a
  // locked phone gave them would otherwise last until the app is restarted.
  test("is announced as changed when the app comes to the foreground", () => {
    const metadata = storedByAnEarlierBuild();
    lockSecureStore();
    resolveCustomHeaderValues(metadata);
    resolveCustomHeaderValues(metadata);
    const version = store.get(customHeadersVersionAtom);

    emitAppState("inactive");
    expect(store.get(customHeadersVersionAtom)).toBe(version);

    emitAppState("active");
    expect(store.get(customHeadersVersionAtom)).toBe(version + 1);

    // Once per failed stretch, not on every return to the app.
    emitAppState("active");
    expect(store.get(customHeadersVersionAtom)).toBe(version + 1);
  });

  test("announces nothing when every read worked", () => {
    const metadata = storedByAnEarlierBuild();
    resolveCustomHeaderValues(metadata);
    const version = store.get(customHeadersVersionAtom);

    emitAppState("active");

    expect(store.get(customHeadersVersionAtom)).toBe(version);
  });

  test("can be read when this build stored it", () => {
    const metadata = secureCustomHeaderMetadata(scope, [
      header("CF-Access-Client-Secret", "secret"),
    ]);
    lockSecureStore();

    expect(resolveCustomHeaderValues(metadata)[0]?.value).toBe("secret");
  });

  // A locked phone in the background is the user's phone doing what it does.
  test("stays out of Sentry", () => {
    const metadata = storedByAnEarlierBuild();
    lockSecureStore();

    resolveCustomHeaderValues(metadata);
    resolveCustomHeaderValues(metadata);

    expect(mockLogAndCaptureError).not.toHaveBeenCalled();
    expect(mockWriteToLog).toHaveBeenCalledTimes(1);
    expect(mockWriteToLog).toHaveBeenCalledWith(
      "WARN",
      expect.any(String),
      expect.stringContaining("User interaction is not allowed"),
    );
  });

  // In the foreground the phone is unlocked, so the Keychain refusing is
  // something else, and worth knowing about.
  test("is reported when the app is in the foreground", () => {
    const metadata = storedByAnEarlierBuild();
    lockSecureStore();
    appState("active");

    resolveCustomHeaderValues(metadata);

    expect(mockLogAndCaptureError).toHaveBeenCalledTimes(1);
  });
});
