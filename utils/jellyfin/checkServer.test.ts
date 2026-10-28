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
const loggedMessages: Array<{
  level: string;
  message: string;
  data?: unknown;
}> = [];
jest.mock("@/utils/log", () => ({
  writeToLog: (level: string, message: string, data?: unknown) => {
    loggedMessages.push({ level, message, data });
  },
  writeInfoLog: (message: string, data?: unknown) => {
    loggedMessages.push({ level: "INFO", message, data });
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

// Only the scrubber is wanted from utils/sentry: what a log message is by the
// time it has left the app. The SDK and what it reads at start-up are not.
jest.mock("@sentry/react-native", () => ({}));
jest.mock("@/utils/storedSettings", () => ({}));
jest.mock("@/utils/version", () => ({}));

import { scrubDeep } from "@/utils/sentry";
import { checkJellyfinServer, ServerTooOldError } from "./checkServer";

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
    json: async () => ({
      Version: "10.10.7",
      ServerName: "Homelab",
      ProductName: "Jellyfin Server",
      ...body,
    }),
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
  mockSavedHeaders.clear();
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

  test("a legacy /emby address is probed at the root first", async () => {
    // Jellyfin 12 removed the /emby and /mediabrowser aliases, so probing
    // under one 404s on an upgraded server.
    routes({ https: async () => okResponse() });

    const result = await checkJellyfinServer("https://host.example/emby/");

    expect(result?.url).toBe("https://host.example");
    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://host.example/System/Info/Public",
    ]);
  });

  test("a too-old answer at the root still tries the address as typed", async () => {
    // The root is a guess: another service can live there.
    fetchImpl = async (url) =>
      okResponse({ Version: url.includes("/emby/") ? "10.11.0" : "4.8.0.0" });

    const result = await checkJellyfinServer("https://host.example/emby");

    expect(result?.url).toBe("https://host.example/emby");
  });

  test("a root that cannot be reached still tries the address as typed", async () => {
    // A proxy can serve Jellyfin under /emby with nothing behind the root.
    fetchImpl = async (url) =>
      url.includes("/emby/") ? okResponse() : networkError();

    const result = await checkJellyfinServer("https://host.example/emby");

    expect(result?.url).toBe("https://host.example/emby");
  });

  test("another service at the root does not stand in for the one typed", async () => {
    fetchImpl = async (url) =>
      okResponse(url.includes("/emby/") ? {} : { ProductName: "Other" });

    const result = await checkJellyfinServer("https://host.example/emby");

    expect(result?.url).toBe("https://host.example/emby");
  });

  test("the root borrows the saved headers of the /emby address", async () => {
    // Saved servers carry their proxy headers under the address they were
    // saved with, and the gateway rejects a root probe without them.
    const saved = [header("CF-Access-Client-Id", "saved")];
    mockSavedHeaders.set("https://host.example/emby", saved);
    routes({ https: async () => okResponse() });

    await checkJellyfinServer("https://host.example/emby");

    expect(
      (fetchCalls[0]?.init as { headers?: Record<string, string> })?.headers,
    ).toEqual({ "CF-Access-Client-Id": "saved" });
    expect(persistedHeaders).toEqual([
      { url: "https://host.example", headers: saved },
    ]);
  });

  test("a legacy /emby address is kept when only it answers", async () => {
    // A reverse proxy can serve Jellyfin under /emby itself.
    fetchImpl = async (url) =>
      url.includes("/emby/") ? okResponse() : statusResponse(404);

    const result = await checkJellyfinServer("https://host.example/emby");

    expect(result?.url).toBe("https://host.example/emby");
    expect(fetchCalls.map((call) => call.url)).toEqual([
      "https://host.example/System/Info/Public",
      "https://host.example/emby/System/Info/Public",
    ]);
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
    mockSavedHeaders.set("http://192.168.1.10:8096", [
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

// --- what leaves the app ---------------------------------------------------
// A log message is mirrored into Sentry as a breadcrumb (utils/log.tsx), and
// the scrubber it passes on the way only knows a host by its scheme or as an
// IPv4 address. The check logged the address as it was typed, which is
// usually without a scheme, and once more with the scheme taken off: users'
// server hostnames stood in plain text in the breadcrumbs of REACT-NATIVE-78,
// -73, -62, -5J and -50.

describe("checkJellyfinServer — the typed address stays out of what Sentry is sent", () => {
  const HOST = "jellyfin.example.org";

  /** The log messages as they arrive at Sentry. */
  const reachesSentry = () =>
    loggedMessages
      .map(({ message }) => scrubDeep(message) as string)
      .join("\n");

  const TYPED = [
    HOST,
    `https://${HOST}`,
    `${HOST}:8096`,
    `http://${HOST}:8096/jellyfin`,
    `  HTTPS://Jellyfin.Example.org  `,
  ];

  test.each(TYPED)("typed as %j, and nothing answers", async (input) => {
    routes({});

    await checkJellyfinServer(input);

    expect(loggedMessages.length).toBeGreaterThan(0);
    expect(reachesSentry().toLowerCase()).not.toContain(HOST);
  });

  test.each(TYPED)("typed as %j, and the server answers", async (input) => {
    routes({
      https: async () => okResponse(),
      http: async () => okResponse(),
    });

    await checkJellyfinServer(input);

    expect(reachesSentry().toLowerCase()).not.toContain(HOST);
  });

  // The platform's own error names the host it could not reach, each in its
  // own words: Android quotes it, iOS writes it into a sentence. What failed
  // is still said, which is what the breadcrumb is for.
  test.each([
    [
      `java.net.UnknownHostException: Unable to resolve host "${HOST}": No address associated with hostname`,
      "java.net.UnknownHostException: Unable to resolve host",
    ],
    [
      `javax.net.ssl.SSLPeerUnverifiedException: Hostname ${HOST} not verified`,
      "javax.net.ssl.SSLPeerUnverifiedException: Hostname [server] not verified",
    ],
    [
      `The certificate for this server is invalid. You might be connecting to a server that is pretending to be \u201c${HOST}\u201d which could put your confidential information at risk.`,
      "pretending to be \u201c[server]\u201d",
    ],
  ])("a failure that names the host: %s", async (message, kept) => {
    routes({
      https: () => Promise.reject(new Error(message)),
      http: () => Promise.reject(new Error(message)),
    });

    await checkJellyfinServer(`${HOST}:8096`);

    expect(reachesSentry()).not.toContain(HOST);
    expect(reachesSentry()).toContain(kept);
  });

  // Jellyfin names itself after its machine unless told otherwise, and an
  // admin who renames it often picks the domain.
  test("a server named after its own address", async () => {
    routes({ https: async () => okResponse({ ServerName: HOST }) });

    const result = await checkJellyfinServer(HOST);

    expect(result?.name).toBe(HOST);
    expect(reachesSentry()).not.toContain(HOST);
  });

  // The host is read out of the address the way the probe's URL is built
  // from it. A second reading of the same text took `admin@host` for the
  // host and gave up on `user:password@host`, so neither was found in the
  // error and the host stayed in it.
  test.each([
    `admin@${HOST}`,
    `https://admin:hunter2@${HOST}:8096/jellyfin`,
    `${HOST}\\jellyfin`,
  ])("typed as %j, with a failure that names the host", async (input) => {
    const failure = () =>
      Promise.reject(new Error(`Hostname ${HOST} not verified`));
    routes({ https: failure, http: failure });

    await checkJellyfinServer(input);

    expect(reachesSentry()).not.toContain(HOST);
    expect(reachesSentry()).not.toContain("hunter2");
    expect(reachesSentry()).toContain("Hostname [server] not verified");
  });

  test("an IPv6 address typed in brackets", async () => {
    const failure = () =>
      Promise.reject(new Error("Hostname 2001:db8::5 not verified"));
    routes({ https: failure, http: failure });

    await checkJellyfinServer("[2001:db8::5]:8096");

    expect(reachesSentry()).not.toContain("2001:db8::5");
  });

  // A certificate error goes on to list the names the certificate is for.
  test("a failure that lists the certificate's other names", async () => {
    const message = [
      `Hostname ${HOST} not verified:`,
      "    certificate: sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "    DN: CN=*.example.org",
      "    subjectAltNames: [*.example.org, example.org]",
    ].join("\n");
    routes({ https: () => Promise.reject(new Error(message)) });

    await checkJellyfinServer(`https://${HOST}`);

    expect(reachesSentry()).not.toContain("example.org");
    expect(reachesSentry()).toContain("Hostname [server] not verified");
    // The lines cut from the message stay in the log on the device, where a
    // user fixing their certificate reads them.
    expect(JSON.stringify(loggedMessages.map(({ data }) => data))).toContain(
      "subjectAltNames",
    );
  });

  // The log on the device is the user's own, and where they look when their
  // server does not answer.
  test("the log on the device still says which address was checked", async () => {
    routes({});

    await checkJellyfinServer(`${HOST}:8096`);

    expect(JSON.stringify(loggedMessages.map(({ data }) => data))).toContain(
      `${HOST}:8096`,
    );
  });
});
