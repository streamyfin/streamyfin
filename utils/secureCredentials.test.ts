import { beforeEach, describe, expect, mock, test } from "bun:test";

const secureStoreValues = new Map<string, string>();

mock.module("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) => value,
}));

mock.module("expo-secure-store", () => ({
  getItem: (key: string) => secureStoreValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    secureStoreValues.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStoreValues.delete(key);
  },
  setItemAsync: async (key: string, value: string) => {
    secureStoreValues.set(key, value);
  },
  getItemAsync: async (key: string) => secureStoreValues.get(key) ?? null,
}));

mock.module("./mmkv", () => ({
  storage: {
    getString: () => undefined,
    set: () => undefined,
    get: () => undefined,
    delete: () => undefined,
  },
}));

mock.module("./store", () => ({
  store: {
    set: () => undefined,
  },
}));

const { secureCustomHeaderMetadata } = await import("./secureCredentials");

import type { CustomHeader } from "./secureCredentials";

const header = (
  key: string,
  value: string,
  secureValueKey?: string,
): CustomHeader => ({
  key,
  value,
  enabled: true,
  secureValueKey,
});

describe("secureCustomHeaderMetadata", () => {
  beforeEach(() => {
    secureStoreValues.clear();
  });

  test("does not assign a generated key that collides with a retained row key", () => {
    const scope = "server:https://example.test";
    const original = secureCustomHeaderMetadata(scope, [
      header("X-First", "first"),
      header("X-Retained", "retained"),
    ]);
    const retainedKey = original[1]?.secureValueKey;

    expect(retainedKey).toBeTruthy();

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
    const firstScope = "server:https://first.example.test";
    const secondScope = "server:https://second.example.test";
    const firstMetadata = secureCustomHeaderMetadata(firstScope, [
      header("CF-Access-Client-Id", "first-secret"),
    ]);
    const copiedSecureValueKey = firstMetadata[0]?.secureValueKey;

    expect(copiedSecureValueKey).toBeTruthy();

    const secondMetadata = secureCustomHeaderMetadata(secondScope, [
      header("CF-Access-Client-Id", "second-secret", copiedSecureValueKey),
    ]);

    expect(secondMetadata[0]?.secureValueKey).not.toBe(copiedSecureValueKey);
    expect(secureStoreValues.get(copiedSecureValueKey!)).toBe("first-secret");
    expect(secureStoreValues.get(secondMetadata[0]!.secureValueKey!)).toBe(
      "second-secret",
    );
  });

  test("allocates a new key when encoded scope prefixes overlap", () => {
    const shorterScope = "a";
    const longerScope = "a\x0f\xC0";
    const longerScopeMetadata = secureCustomHeaderMetadata(longerScope, [
      header("CF-Access-Client-Id", "longer-secret"),
    ]);
    const overlappingSecureValueKey = longerScopeMetadata[0]?.secureValueKey;

    expect(overlappingSecureValueKey).toBeTruthy();

    const shorterScopeMetadata = secureCustomHeaderMetadata(shorterScope, [
      header(
        "CF-Access-Client-Id",
        "shorter-secret",
        overlappingSecureValueKey,
      ),
    ]);

    expect(shorterScopeMetadata[0]?.secureValueKey).not.toBe(
      overlappingSecureValueKey,
    );
    expect(secureStoreValues.get(overlappingSecureValueKey!)).toBe(
      "longer-secret",
    );
    expect(
      secureStoreValues.get(shorterScopeMetadata[0]!.secureValueKey!),
    ).toBe("shorter-secret");
  });
});
