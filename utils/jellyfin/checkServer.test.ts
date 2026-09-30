import axios, { type AxiosRequestConfig } from "axios";
import MockAdapter from "axios-mock-adapter";
import { setJellyfinHeaders } from "@/test-utils/customHeaders";
import type { CustomHeader } from "@/utils/customHeaders/types";

// checkServer pulls the two helpers through the barrel file, which also
// re-exports modules with native dependencies (MMKV, SecureStore) — so the
// barrel is replaced with the real pure helpers plus stubbed resolvers.
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
// No proxy headers in these specs.
beforeEach(() => setJellyfinHeaders());

// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// this spec's module under test actually calls.
const loggedMessages: Array<{ level: string; message: string }> = [];
jest.mock("@/utils/log", () => ({
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

const mockSavedHeaders = new Map<string, CustomHeader[]>();
const persistedHeaders: Array<{ url: string; headers: CustomHeader[] }> = [];
jest.mock("@/utils/secureCredentials", () => ({
  getServerCustomHeaders: (url: string) => mockSavedHeaders.get(url) ?? [],
  updateServerCustomHeaders: (url: string, headers: CustomHeader[]) => {
    persistedHeaders.push({ url, headers });
  },
}));

import { checkJellyfinServer, ServerTooOldError } from "./checkServer";

type ProbeReply = [number, unknown];
let transport: MockAdapter;
let requestImpl: (config: AxiosRequestConfig) => Promise<ProbeReply>;

afterEach(() => transport.restore());

const okResponse = (body: Record<string, unknown> = {}): ProbeReply => [
  200,
  { Version: "10.10.7", ServerName: "Homelab", ...body },
];

const statusResponse = (status: number): ProbeReply => [status, {}];

const networkError = () =>
  Promise.reject(new TypeError("Network request failed"));

/** Simulates a socket that accepts but never answers — only the caller's
 * abort signal ends it, like a plain-HTTP port receiving a TLS handshake. */
const hangUntilAborted = (config: AxiosRequestConfig) =>
  new Promise<ProbeReply>((_, reject) => {
    config.signal?.addEventListener?.("abort", () =>
      reject(new Error("Aborted")),
    );
  });

/** Routes by protocol so tests can script https and http independently. */
const routes = (impl: {
  https?: (config: AxiosRequestConfig) => Promise<ProbeReply>;
  http?: (config: AxiosRequestConfig) => Promise<ProbeReply>;
}) => {
  requestImpl = (config) =>
    config.url?.startsWith("https://")
      ? (impl.https ?? networkError)(config)
      : (impl.http ?? networkError)(config);
};

beforeEach(() => {
  // New axios instances inherit this adapter. The SDK still builds the real
  // URL, applies headers and transforms the response before the check runs.
  transport = new MockAdapter(axios, { onNoMatch: "throwException" });
  transport.onAny().reply((config) => requestImpl(config));
  loggedMessages.length = 0;
  mockSavedHeaders.clear();
  persistedHeaders.length = 0;
  requestImpl = networkError;
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
    expect(transport.history.get.map((c) => c.url)).toEqual([
      "http://192.168.1.10:8096/System/Info/Public",
    ]);
  });

  test("a typed https:// is never silently downgraded to http", async () => {
    routes({}); // everything unreachable

    const result = await checkJellyfinServer("https://media.example.com");

    expect(result).toBeUndefined();
    expect(transport.history.get.map((c) => c.url)).toEqual([
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
    expect(transport.history.get.map((c) => c.url)).toEqual([
      "https://192.168.1.10:8096/System/Info/Public",
      "http://192.168.1.10:8096/System/Info/Public",
    ]);
  });

  test("the typed scheme survives casing and surrounding whitespace", async () => {
    routes({ http: async () => okResponse() });

    const result = await checkJellyfinServer("  HTTP://192.168.1.10:8096  ");

    expect(result?.url).toBe("http://192.168.1.10:8096");
    expect(transport.history.get).toHaveLength(1);
  });

  test("port and path are preserved verbatim", async () => {
    routes({ http: async () => okResponse() });

    const result = await checkJellyfinServer("http://10.0.0.5:3000/jellyfin");

    expect(result?.url).toBe("http://10.0.0.5:3000/jellyfin");
    expect(transport.history.get[0]?.url).toBe(
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
    ).toBe(true);
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
    ).toBe(true);
  });

  test("returns undefined when nothing answers", async () => {
    routes({});

    const result = await checkJellyfinServer("192.168.1.10:8096");

    expect(result).toBeUndefined();
    expect(transport.history.get).toHaveLength(2);
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

    const httpCall = transport.history.get.find((c) =>
      c.url?.startsWith("http://"),
    );
    expect(httpCall?.headers?.["CF-Access-Client-Id"]).toBe("abc");
    expect(persistedHeaders).toEqual([
      { url: "http://192.168.1.10:8096", headers: typed },
    ]);
  });

  test("saved headers are reused when none are passed, and nothing is re-persisted", async () => {
    mockSavedHeaders.set("http://192.168.1.10:8096", [
      header("CF-Access-Client-Id", "saved"),
    ]);
    routes({ http: async () => okResponse() });

    await checkJellyfinServer("http://192.168.1.10:8096");

    expect(transport.history.get[0]?.headers?.["CF-Access-Client-Id"]).toBe(
      "saved",
    );
    expect(persistedHeaders).toHaveLength(0);
  });

  test("headers that fail to reach the server are not persisted", async () => {
    routes({});

    await checkJellyfinServer("192.168.1.10:8096", [
      header("CF-Access-Client-Id", "abc"),
    ]);

    expect(persistedHeaders).toHaveLength(0);
  });

  test("an explicit empty list clears saved headers only after a successful probe", async () => {
    mockSavedHeaders.set("https://media.example.com", [
      header("CF-Access-Client-Id", "saved"),
    ]);
    routes({ https: async () => okResponse() });

    await checkJellyfinServer("https://media.example.com", []);

    expect(
      transport.history.get[0]?.headers?.["CF-Access-Client-Id"],
    ).toBeUndefined();
    expect(transport.history.get[0]?.headers?.Authorization).toBeUndefined();
    expect(persistedHeaders).toEqual([
      { url: "https://media.example.com", headers: [] },
    ]);
  });
});

describe("checkJellyfinServer SDK transport", () => {
  test("does not accept a gateway's HTML response as a server", async () => {
    routes({ https: async () => [200, "<html>Sign in</html>"] });

    expect(
      await checkJellyfinServer("https://media.example.com"),
    ).toBeUndefined();
    expect(persistedHeaders).toHaveLength(0);
  });

  test("logs an HTML gateway status before falling back", async () => {
    routes({
      https: async () => [502, "<html>Gateway error</html>"],
      http: async () => okResponse(),
    });

    expect(await checkJellyfinServer("media.example.com")).toEqual({
      url: "http://media.example.com",
      name: "Homelab",
    });
    expect(loggedMessages).toContainEqual({
      level: "WARN",
      message: "Server check: https://media.example.com answered HTTP 502",
    });
    expect(
      loggedMessages.some(({ message }) => message.includes("<html>")),
    ).toBe(false);
  });

  for (const { name, body } of [
    { name: "null", body: null },
    { name: "array", body: [] },
  ]) {
    test(`rejects ${name} success data without persisting headers`, async () => {
      routes({ https: async () => [200, body] });

      const result = await checkJellyfinServer("https://media.example.com", [
        header("CF-Access-Client-Id", "typed-header"),
      ]);

      expect(result).toBeUndefined();
      expect(persistedHeaders).toHaveLength(0);
      expect(loggedMessages).toContainEqual({
        level: "WARN",
        message:
          "Server check: https://media.example.com answered HTTP 200 without Jellyfin JSON",
      });
    });
  }
});
