const mockSecureStoreValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItem: (key: string) => mockSecureStoreValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mockSecureStoreValues.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecureStoreValues.delete(key);
  },
}));

import {
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
} from "./secureValues";

import type { CustomHeader } from "./types";

const header = (
  key: string,
  value: string,
  secureValueKey?: string,
): CustomHeader => ({ key, value, enabled: true, secureValueKey });

describe("secureCustomHeaderMetadata", () => {
  beforeEach(() => {
    mockSecureStoreValues.clear();
  });

  test("keeps values out of the persisted metadata", () => {
    const metadata = secureCustomHeaderMetadata("server:https://example.test", [
      header("CF-Access-Client-Id", "id-value"),
    ]);

    expect(metadata[0]?.value).toBe("");
    expect(metadata[0]?.secureValueKey).toBeTruthy();
    expect(mockSecureStoreValues.get(metadata[0]!.secureValueKey!)).toBe(
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

    expect(mockSecureStoreValues.get(edited[0]!.secureValueKey!)).toBe(
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

    expect(mockSecureStoreValues.has(removedKey)).toBe(false);
    expect(mockSecureStoreValues.get(original[1]!.secureValueKey!)).toBe(
      "kept",
    );
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
    expect(mockSecureStoreValues.get(metadata[0]!.secureValueKey!)).toBe(
      "retained-new-value",
    );
    expect(mockSecureStoreValues.get(metadata[1]!.secureValueKey!)).toBe(
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
    expect(mockSecureStoreValues.get(copiedKey!)).toBe("first-secret");
    expect(mockSecureStoreValues.get(secondMetadata[0]!.secureValueKey!)).toBe(
      "second-secret",
    );
  });

  test("handles a non-ASCII scope", () => {
    const metadata = secureCustomHeaderMetadata("server:https://медиа.test", [
      header("CF-Access-Client-Id", "id-value"),
    ]);

    expect(mockSecureStoreValues.get(metadata[0]!.secureValueKey!)).toBe(
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
    expect(mockSecureStoreValues.get(overlappingKey!)).toBe("longer-secret");
    expect(
      mockSecureStoreValues.get(shorterScopeMetadata[0]!.secureValueKey!),
    ).toBe("shorter-secret");
  });
});
