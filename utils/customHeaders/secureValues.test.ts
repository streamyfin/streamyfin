import * as SecureStore from "expo-secure-store";
import { stubReactNative } from "@/test-utils/reactNative";
import {
  clearSecureStore,
  lockSecureStore,
  secureStoreValues,
} from "@/test-utils/secureStore";
import {
  recreateLegacySecureValues,
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
} from "./secureValues";
import type { CustomHeader } from "./types";

jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);

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

// iOS can launch the app in the background while the phone is locked. The
// Keychain then refuses every item stored as readable only when unlocked, the
// default, and the read throws in the middle of a render (Sentry
// REACT-NATIVE-16, REACT-NATIVE-AA).
describe("a header value on a locked phone", () => {
  const scope = "server:https://example.test";

  /** The key a build from before the fix gave the scope's row `index`. */
  const legacyKey = (index: number, ofScope = scope) =>
    `custom_header_value_${btoa(ofScope).replace(/=+$/, "")}_${index}`;

  /** A row whose value an earlier build stored, readable only when unlocked. */
  const storedByAnEarlierBuild = (name: string, value: string, index = 0) => {
    secureStoreValues.set(legacyKey(index), value);
    return header(name, "", legacyKey(index));
  };

  beforeEach(() => {
    clearSecureStore();
    stubReactNative();
  });

  test("can be read when this build stored it", () => {
    const metadata = secureCustomHeaderMetadata(scope, [
      header("CF-Access-Client-Secret", "secret"),
    ]);
    lockSecureStore();

    expect(resolveCustomHeaderValues(metadata)[0]?.value).toBe("secret");
  });

  // Saving over an item keeps the accessibility it was created with, so the
  // value has to become a new item. That is the move's job, with its
  // read-back; a save keeps writing to the key the row already has.
  test("keeps its key when a row from an earlier build is saved again", () => {
    const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "old");

    const [saved] = secureCustomHeaderMetadata(
      scope,
      [{ ...row, value: "new" }],
      [row],
    );

    expect(saved?.secureValueKey).toBe(legacyKey(0));
    expect(secureStoreValues.get(legacyKey(0))).toBe("new");
  });

  describe("moved off what an earlier build stored", () => {
    test("can be read, under a new key", () => {
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");

      const moved = recreateLegacySecureValues(scope, [row]);

      expect(moved?.replaced).toEqual([row]);
      expect(moved?.headers[0]?.secureValueKey).not.toBe(legacyKey(0));
      lockSecureStore();
      expect(resolveCustomHeaderValues(moved?.headers ?? [])).toEqual([
        { ...row, value: "secret", secureValueKey: expect.any(String) },
      ]);
    });

    // The caller drops the old item, and only once the rows that point at the
    // new one are saved: until then it is the copy the stored rows refer to.
    test("leaves the old item where it is", () => {
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");

      recreateLegacySecureValues(scope, [row]);

      expect(secureStoreValues.get(legacyKey(0))).toBe("secret");
    });

    test("has nothing to do the second time", () => {
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");
      const moved = recreateLegacySecureValues(scope, [row]);

      expect(recreateLegacySecureValues(scope, moved?.headers ?? [])).toBe(
        null,
      );
    });

    test("does not take a key another row of the scope holds", () => {
      const [current] = secureCustomHeaderMetadata(scope, [
        header("CF-Access-Client-Id", "id"),
      ]);
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");

      const moved = recreateLegacySecureValues(scope, [current!, row]);

      expect(resolveCustomHeaderValues(moved?.headers ?? [])).toEqual([
        expect.objectContaining({ value: "id" }),
        expect.objectContaining({ value: "secret" }),
      ]);
    });

    test("stays where it is while the phone is locked, and moves later", () => {
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");
      lockSecureStore();

      expect(recreateLegacySecureValues(scope, [row])).toBe(null);
      expect(secureStoreValues.get(legacyKey(0))).toBe("secret");

      lockSecureStore(false);

      expect(recreateLegacySecureValues(scope, [row])?.replaced).toEqual([row]);
    });

    test("stays where it is when the new item does not read back", () => {
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");
      const write = jest
        .spyOn(SecureStore, "setItem")
        .mockImplementationOnce(() => undefined);

      expect(recreateLegacySecureValues(scope, [row])).toBe(null);

      write.mockRestore();
    });

    test("moves the rows it can and keeps the one it cannot", () => {
      const first = storedByAnEarlierBuild("CF-Access-Client-Id", "id", 0);
      const second = storedByAnEarlierBuild("CF-Access-Client-Secret", "s", 1);
      const write = jest
        .spyOn(SecureStore, "setItem")
        .mockImplementationOnce(() => {
          throw new Error("The Keychain refused the write");
        });

      const moved = recreateLegacySecureValues(scope, [first, second]);

      write.mockRestore();
      expect(moved?.replaced).toEqual([second]);
      expect(moved?.headers[0]).toBe(first);
      expect(resolveCustomHeaderValues(moved?.headers ?? [])).toEqual([
        expect.objectContaining({ value: "id" }),
        expect.objectContaining({ value: "s" }),
      ]);
    });

    // The accessibility is the iOS Keychain's. On Android there is nothing
    // to gain from storing a secret a second time.
    test("is left alone on Android", () => {
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");
      stubReactNative({ OS: "android" });

      expect(recreateLegacySecureValues(scope, [row])).toBe(null);
      expect([...secureStoreValues.keys()]).toEqual([legacyKey(0)]);
    });

    // The rows are whatever an older build left in storage.
    test("steps over a row it cannot make sense of", () => {
      const row = storedByAnEarlierBuild("CF-Access-Client-Secret", "secret");
      const junk = null as unknown as CustomHeader;

      const moved = recreateLegacySecureValues(scope, [junk, row]);

      expect(moved?.headers[0]).toBe(junk);
      expect(moved?.replaced).toEqual([row]);
    });

    test("leaves a row with nothing stored behind it alone", () => {
      const row = header("CF-Access-Client-Secret", "", legacyKey(0));

      expect(recreateLegacySecureValues(scope, [row])).toBe(null);
    });
  });
});
