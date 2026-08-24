import * as SecureStore from "expo-secure-store";
import { atom } from "jotai";
import { store } from "@/utils/store";
import type { CustomHeader } from "./types";

const CUSTOM_HEADER_VALUE_KEY_PREFIX = "custom_header_value_";

/**
 * Bumped whenever any header configuration is written. Consumers that build a
 * long-lived client from the headers (axios instances, image sources) depend on
 * it so an edit in settings takes effect without a restart.
 */
export const customHeadersVersionAtom = atom(0);

export function bumpCustomHeadersVersion(): void {
  store.set(customHeadersVersionAtom, (version) => version + 1);
}

/**
 * URL-safe base64 so a scope can be embedded in a SecureStore key. `btoa` only
 * accepts Latin-1, so the input is UTF-8 encoded first — a server URL with
 * non-ASCII characters (an IDN entered in Unicode form) would otherwise throw.
 */
function encodeStorageKey(input: string): string {
  const utf8 = encodeURIComponent(input).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );

  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function customHeaderValueKey(scope: string, index: number): string {
  return `${CUSTOM_HEADER_VALUE_KEY_PREFIX}${encodeStorageKey(scope)}_${index}`;
}

/** Guards against one scope reusing (and later deleting) another scope's key. */
function secureValueKeyScopeMatches(
  scope: string,
  secureValueKey: string,
): boolean {
  if (!secureValueKey.startsWith(CUSTOM_HEADER_VALUE_KEY_PREFIX)) return false;

  const encodedScope = encodeStorageKey(scope);
  const keySuffix = secureValueKey.slice(CUSTOM_HEADER_VALUE_KEY_PREFIX.length);
  const separatorIndex = keySuffix.lastIndexOf("_");

  return (
    separatorIndex > -1 && keySuffix.slice(0, separatorIndex) === encodedScope
  );
}

/** Persisted JSON is user-editable state from an older build — validate it. */
export function isStoredCustomHeader(header: unknown): header is CustomHeader {
  if (!header || typeof header !== "object") return false;
  const candidate = header as CustomHeader;

  return (
    typeof candidate.key === "string" &&
    typeof candidate.value === "string" &&
    typeof candidate.enabled === "boolean" &&
    (typeof candidate.secureValueKey === "string" ||
      candidate.secureValueKey === undefined) &&
    (typeof candidate.presetId === "string" || candidate.presetId === undefined)
  );
}

/**
 * SecureStore has no synchronous delete, so a removal is in flight while the
 * (synchronous) writes below have already landed. Keys are deterministic per
 * scope, so deleting a scope and immediately re-creating it would let the stale
 * delete wipe the new value — writing again once it settles keeps the last
 * write authoritative.
 */
const pendingDeletes = new Map<string, Promise<void>>();

function deleteSecureValue(key: string): void {
  const deletion = SecureStore.deleteItemAsync(key)
    .catch(() => undefined)
    .then(() => {
      if (pendingDeletes.get(key) === deletion) pendingDeletes.delete(key);
    });

  pendingDeletes.set(key, deletion);
}

function writeSecureValue(key: string, value: string): void {
  SecureStore.setItem(key, value);

  const deletion = pendingDeletes.get(key);
  if (deletion) {
    void deletion.then(() => {
      SecureStore.setItem(key, value);
    });
  }
}

function getSecureHeaderValue(header: CustomHeader): string {
  if (!header.secureValueKey) return header.value;
  return SecureStore.getItem(header.secureValueKey) ?? "";
}

/** Fills in the SecureStore-backed values for display or request injection. */
export function resolveCustomHeaderValues(
  headers: CustomHeader[],
): CustomHeader[] {
  return headers.filter(isStoredCustomHeader).map((header) => ({
    ...header,
    value: getSecureHeaderValue(header),
  }));
}

/**
 * Writes each header value to SecureStore and returns the metadata to persist
 * in MMKV (same shape, empty values). Values belonging to the scope that are no
 * longer referenced are deleted.
 *
 * `headers` must carry real values — pass what the editor holds, never metadata
 * rows straight out of storage, or the stored values are overwritten with the
 * empty strings that stand in for them.
 *
 * @param scope Namespace for the generated keys, e.g. `server:https://host`.
 */
export function secureCustomHeaderMetadata(
  scope: string,
  headers: CustomHeader[],
  previousHeaders: CustomHeader[] = [],
): CustomHeader[] {
  const retainedKeys = new Set(
    headers
      .map((header) => header.secureValueKey)
      .filter((key): key is string => Boolean(key)),
  );
  const nextKeys = new Set<string>();
  let nextGeneratedIndex = 0;

  const allocateSecureValueKey = () => {
    let secureValueKey: string;
    do {
      secureValueKey = customHeaderValueKey(scope, nextGeneratedIndex);
      nextGeneratedIndex += 1;
    } while (retainedKeys.has(secureValueKey) || nextKeys.has(secureValueKey));
    return secureValueKey;
  };

  const canReuseSecureValueKey = (secureValueKey: string) =>
    secureValueKeyScopeMatches(scope, secureValueKey) &&
    !nextKeys.has(secureValueKey);

  const metadata = headers.map((header) => {
    const secureValueKey =
      header.secureValueKey && canReuseSecureValueKey(header.secureValueKey)
        ? header.secureValueKey
        : allocateSecureValueKey();
    nextKeys.add(secureValueKey);
    writeSecureValue(secureValueKey, header.value);

    return {
      key: header.key,
      value: "",
      enabled: header.enabled,
      secureValueKey,
      presetId: header.presetId,
    };
  });

  for (const header of previousHeaders.filter(isStoredCustomHeader)) {
    if (header.secureValueKey && !nextKeys.has(header.secureValueKey)) {
      deleteSecureValue(header.secureValueKey);
    }
  }

  return metadata;
}

/** Drops the SecureStore values behind header metadata that is being discarded. */
export function deleteSecureCustomHeaderValues(headers: CustomHeader[]): void {
  for (const header of headers.filter(isStoredCustomHeader)) {
    if (header.secureValueKey) {
      deleteSecureValue(header.secureValueKey);
    }
  }
}
