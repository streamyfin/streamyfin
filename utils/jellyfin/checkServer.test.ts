import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  setJellyfinHeaders,
  stubCustomHeaders,
} from "@/test-utils/customHeaders";
import type { CustomHeader } from "@/utils/customHeaders/types";

// checkServer pulls the two helpers through the barrel file, which also
// re-exports modules with native dependencies (MMKV, SecureStore) — so the
// barrel is replaced with just the real implementations of what it needs.
stubCustomHeaders();
// No proxy headers in these specs, set per test so another file cannot
// leave its own behind.
beforeEach(() => setJellyfinHeaders());

// Bun's mock.module retroactively re-links every module already importing the
// specifier, so a log mock must cover the module's full function surface —
// a missing name breaks OTHER test files' modules that import it.
const loggedMessages: Array<{ level: string; message: string }> = [];
mock.module("@/utils/log", () => ({
  writeToLog: (level: string, message: string) => {
    loggedMessages.push({ level, message });
  },
  writeInfoLog: (message: string) => {
    loggedMessages.push({ level: "INFO", message });
  },
  writeErrorLog: (message: string) => {
    loggedMessages.push({ level: "ERROR", message });
  },
  writeDebugLog: () => undefined,
  logAndCaptureError: (message: string) => {
    loggedMessages.push({ level: "ERROR", message });
  },
  readFromLog: () => [],
}));

const savedHeaders = new Map<string, CustomHeader[]>();
const persistedHeaders: Array<{ url: string; headers: CustomHeader[] }> = [];
mock.module("@/utils/secureCredentials", () => ({
  getServerCustomHeaders: (url: string) => savedHeaders.get(url) ?? [],
  updateServerCustomHeaders: (url: string, headers: CustomHeader[]) => {
    persistedHeaders.push({ url, headers });
  },
}));

const { checkJellyfinServer, ServerTooOldError } = await import(
  "./checkServer"
);

// --- fetch stub ------------------------------------------------------------

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: FetchCall[] = [];
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

const realFetch = globalThis.fetch;
globalThis.fetch = ((url: string, init?: RequestInit) => {
  fetchCalls.push({ url, init });
  return fetchImpl(url, init);
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
});

const okResponse = (body: Record<string, unknown> = {}): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ Version: "10.10.7", ServerName: "Homelab", ...body }),
  }) as Response;

const statusResponse = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

const networkError = () =>
  Promise.reject(new TypeError("Network request failed"));

/** Simulates a socket that accepts but never answers — only the caller's
 * abort signal ends it, like a plain-HTTP port receiving a TLS handshake. */
const hangUntilAborted = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
  });

/** Routes by protocol so tests can script https and http independently. */
const routes = (impl: {
  https?: (init?: RequestInit) => Promise<Response>;
  http?: (init?: RequestInit) => Promise<Response>;
}) => {
  fetchImpl = (url, init) =>
    url.startsWith("https://")
      ? (impl.https ?? networkError)(init)
      : (impl.http ?? networkError)(init);
};

beforeEach(() => {
  fetchCalls = [];
  loggedMessages.length = 0;
  savedHeaders.clear();
  persistedHeaders.length = 0;
  fetchImpl = networkError;
});

const header = (key: string, value: string): CustomHeader => ({
  key,
  value,
  enabled: true,
});

// --- scheme handling -------------------------------------------------------
// Regression tests for "local IP with a typed http:// won't connect": the
// probe used to discard the typed scheme and always try https first, which
// can hang against a plain-HTTP port on a LAN IP.

describe("checkJellyfinServer scheme handling", () => {
  test("a typed http:// is trusted as-is — no https probe is ever made", async () => {
    routes({ http: async () => okResponse() });

    const result = await checkJellyfinServer("http://192.168.1.10:8096");

    expect(result).toEqual({
      url: "http://192.168.1.10:8096",
      name: "Homelab",
    });
    expect(fetchCalls.map((c) => c.url)).toEqual([
      "http://192.168.1.10:8096/System/Info/Public",
    ]);
  });

  test("a typed https:// is never silently downgraded to http", async () => {
    routes({}); // everything unreachable

    const result = await checkJellyfinServer("https://media.example.com");

    expect(result).toBeUndefined();
    expect(fetchCalls.map((c) => c.url)).toEqual([
      "https://media.example.com/System/Info/Public",
    ]);
  });

  test("schemeless input probes https first, then falls back to http", async () => {
    routes({ https: networkError, http: async () => okResponse() });

    const result = await checkJellyfinServer("192.168.1.10:8096");

    expect(result).toEqual({
      url: "http://192.168.1.10:8096",
      name: "Homelab",
    });
    expect(fetchCalls.map((c) => c.url)).toEqual([
      "https://192.168.1.10:8096/System/Info/Public",
      "http://192.168.1.10:8096/System/Info/Public",
    ]);
  });

  test("the typed scheme survives casing and surrounding whitespace", async () => {
    routes({ http: async () => okResponse() });

    const result = await checkJellyfinServer("  HTTP://192.168.1.10:8096  ");

    expect(result?.url).toBe("http://192.168.1.10:8096");
    expect(fetchCalls).toHaveLength(1);
  });

  test("port and path are preserved verbatim", async () => {
    routes({ http: async () => okResponse() });

    const result = await checkJellyfinServer("http://10.0.0.5:3000/jellyfin");

    expect(result?.url).toBe("http://10.0.0.5:3000/jellyfin");
    expect(fetchCalls[0]?.url).toBe(
      "http://10.0.0.5:3000/jellyfin/System/Info/Public",
    );
  });
});

// --- probe robustness ------------------------------------------------------

describe("checkJellyfinServer probing", () => {
  test("a hanging candidate is aborted after the timeout instead of blocking the fallback", async () => {
    routes({ https: hangUntilAborted, http: async () => okResponse() });

    const result = await checkJellyfinServer(
      "192.168.1.10:8096",
      undefined,
      20,
    );

    expect(result?.url).toBe("http://192.168.1.10:8096");
    // Probe failures are routine (fallback still succeeds here), so they log
    // as WARN — local trail only, never a Sentry event.
    expect(
      loggedMessages.some(
        (m) => m.level === "WARN" && m.message.includes("timed out after 20ms"),
      ),
    ).toBeTrue();
  });

  test("a non-OK https answer (e.g. a gateway 403) still falls through to http", async () => {
    routes({
      https: async () => statusResponse(403),
      http: async () => okResponse(),
    });

    const result = await checkJellyfinServer("192.168.1.10:8096");

    expect(result?.url).toBe("http://192.168.1.10:8096");
    expect(
      loggedMessages.some(
        (m) => m.level === "WARN" && m.message.includes("HTTP 403"),
      ),
    ).toBeTrue();
  });

  test("returns undefined when nothing answers", async () => {
    routes({});

    const result = await checkJellyfinServer("192.168.1.10:8096");

    expect(result).toBeUndefined();
    expect(fetchCalls).toHaveLength(2);
  });

  test("a server older than 10.10 throws ServerTooOldError", async () => {
    routes({ http: async () => okResponse({ Version: "10.8.13" }) });

    await expect(
      checkJellyfinServer("http://192.168.1.10:8096"),
    ).rejects.toThrow(ServerTooOldError);
  });

  test("an unparseable version is given the benefit of the doubt", async () => {
    routes({ http: async () => okResponse({ Version: "unstable" }) });

    const result = await checkJellyfinServer("http://192.168.1.10:8096");

    expect(result?.url).toBe("http://192.168.1.10:8096");
  });
});

// --- custom headers --------------------------------------------------------

describe("checkJellyfinServer custom headers", () => {
  test("typed headers are sent with the probe and persisted only for the URL that answered", async () => {
    routes({ https: networkError, http: async () => okResponse() });
    const typed = [header("CF-Access-Client-Id", "abc")];

    await checkJellyfinServer("192.168.1.10:8096", typed);

    const httpCall = fetchCalls.find((c) => c.url.startsWith("http://"));
    expect(
      (httpCall?.init as { headers?: Record<string, string> })?.headers,
    ).toEqual({ "CF-Access-Client-Id": "abc" });
    expect(persistedHeaders).toEqual([
      { url: "http://192.168.1.10:8096", headers: typed },
    ]);
  });

  test("saved headers are reused when none are passed, and nothing is re-persisted", async () => {
    savedHeaders.set("http://192.168.1.10:8096", [
      header("CF-Access-Client-Id", "saved"),
    ]);
    routes({ http: async () => okResponse() });

    await checkJellyfinServer("http://192.168.1.10:8096");

    expect(
      (fetchCalls[0]?.init as { headers?: Record<string, string> })?.headers,
    ).toEqual({ "CF-Access-Client-Id": "saved" });
    expect(persistedHeaders).toHaveLength(0);
  });

  test("headers that fail to reach the server are not persisted", async () => {
    routes({});

    await checkJellyfinServer("192.168.1.10:8096", [
      header("CF-Access-Client-Id", "abc"),
    ]);

    expect(persistedHeaders).toHaveLength(0);
  });
});
