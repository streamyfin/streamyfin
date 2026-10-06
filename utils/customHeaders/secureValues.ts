import * as SecureStore from "expo-secure-store";
import { atom } from "jotai";
import { AppState } from "react-native";
import { logAndCaptureError, writeToLog } from "@/utils/log";
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

/**
 * iOS can launch the app in the background while the phone is locked, and the
 * requests made there need the headers. The default, readable only while
 * unlocked, refuses every read on such a launch. No weaker than this: the
 * values stay unreadable until the phone has been unlocked once after a
 * restart.
 *
 * It only takes on an item being created. Saving over an existing one updates
 * its data and keeps the accessibility it was created with, so a value stored
 * by an earlier build stays as it was until its row is removed and added back.
 */
const WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

function writeSecureValue(key: string, value: string): void {
  SecureStore.setItem(key, value, WRITE_OPTIONS);

  const deletion = pendingDeletes.get(key);
  if (deletion) {
    void deletion.then(() => {
      SecureStore.setItem(key, value, WRITE_OPTIONS);
    });
  }
}

let failedReads = 0;
let awaitingForeground = false;
let reportedUnexpectedFailure = false;

/**
 * A read can fail and then start working without anything in the
 * configuration changing, so nothing would tell the clients and image sources
 * that memoized the empty headers to ask again. Reaching the foreground is the
 * one moment the phone is known to be unlocked.
 */
function announceHeadersOnForeground(): void {
  if (awaitingForeground) return;
  awaitingForeground = true;

  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    subscription.remove();
    awaitingForeground = false;
    bumpCustomHeadersVersion();
  });
}

function noteFailedRead(error: unknown): void {
  failedReads += 1;
  const firstOfThisStretch = !awaitingForeground;
  announceHeadersOnForeground();

  if (AppState.currentState === "background") {
    // The phone is locked: expected, and over as soon as it is unlocked.
    if (firstOfThisStretch) {
      writeToLog(
        "WARN",
        "Custom header values are unreadable in the background",
        error instanceof Error ? error.message : String(error),
      );
    }
    return;
  }

  // Anywhere but the background the phone is unlocked, so this is not the
  // lock. The headers are dropped all the same, which looks exactly like a
  // server outage.
  if (!reportedUnexpectedFailure) {
    reportedUnexpectedFailure = true;
    logAndCaptureError("Custom header value could not be read", error);
  }
}

/**
 * Runs `read` and tells whether every stored value it asked for was there to
 * be had. When `complete` is false the result holds an empty string in place
 * of each value the Keychain refused: fit to render, but not to be remembered,
 * written back, or sent in place of the real thing.
 */
export function trackSecureReads<T>(read: () => T): {
  value: T;
  complete: boolean;
} {
  const failedBefore = failedReads;
  const value = read();
  return { value, complete: failedReads === failedBefore };
}

function getSecureHeaderValue(header: CustomHeader): string {
  if (!header.secureValueKey) return header.value;

  // This runs during render (every <Image> resolves its headers through it),
  // so a refusal from the Keychain must not become a thrown error: it took
  // the whole provider tree down with it.
  try {
    return SecureStore.getItem(header.secureValueKey) ?? "";
  } catch (error) {
    noteFailedRead(error);
    return "";
  }
}

/**
 * Fills in the SecureStore-backed values for display or request injection.
 * Never throws: a value that could not be read comes back empty, and
 * `trackSecureReads` tells a caller that needs to know the difference.
 */
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
