// Only what reaches Sentry is under test: the SDK is replaced by a recorder
// that plays the scope back, and the local log writes into the MMKV double.
type Captured = {
  exception: unknown;
  fingerprint?: string[];
  contexts: Record<string, unknown>;
};
const mockCaptured: Captured[] = [];
// The real log is under test, not the silent double `test-utils/unitSetup.ts` installs.
jest.unmock("@/utils/log");
jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: () => {},
  withScope: (run: (scope: unknown) => void) => {
    const event: Captured = { exception: undefined, contexts: {} };
    const scope = {
      setContext: (name: string, value: unknown) => {
        event.contexts[name] = value;
      },
      setFingerprint: (fingerprint: string[]) => {
        event.fingerprint = fingerprint;
      },
      setExtra: () => {},
    };
    mockCaptured.push(event);
    run(scope);
    if (event.exception === undefined) mockCaptured.pop();
  },
  captureException: (exception: unknown) => {
    mockCaptured[mockCaptured.length - 1].exception = exception;
  },
}));

import axios, { AxiosError, type AxiosResponse } from "axios";
import { clearMmkv } from "@/test-utils/mmkv";
import { isErrorReported, markExpectedError } from "./errors";
import {
  logAndCaptureError,
  normalizeNativeDetail,
  readFromLog,
  writeErrorLog,
} from "./log";

// The session's memory outlives a test, so each one fails in its own place.
let serverCount = 0;
const newServer = () => `https://log-${++serverCount}.example.com`;

const httpError = (
  server: string,
  path: string,
  status: number,
  headers: Record<string, string> = {},
  data?: unknown,
) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    { method: "get", url: `${server}${path}`, headers: {} as never },
    {},
    { status, headers, data, config: {} } as unknown as AxiosResponse,
  );

beforeEach(() => {
  mockCaptured.length = 0;
  clearMmkv();
});

// Settings, Logs shares this log as logs.txt, which users attach to public
// issues. Callers pass what they caught as is (hooks/useLibraryPlayQueue.ts),
// and a raw AxiosError serializes its request config, headers and body included.
describe("writeErrorLog: a failed request is stored without its credentials", () => {
  // Rejects the way the XHR adapter does when the server cannot be reached.
  const unreachable = axios.create({
    adapter: (config) =>
      Promise.reject(
        new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, {}),
      ),
  });
  const failureOf = (request: Promise<unknown>) =>
    request.then(
      () => {
        throw new Error("the request was expected to fail");
      },
      (error: unknown) => error,
    );

  test("a library request keeps its token, API key and proxy header out", async () => {
    const error = await failureOf(
      unreachable.get(
        "https://jellyfin.example.test/Users/user-1/Items?api_key=key-in-url&Limit=50",
        {
          headers: {
            Authorization:
              'MediaBrowser Client="Streamyfin", Token="token-in-header"',
            "X-Emby-Token": "token-in-emby-header",
            // One the user added for their reverse proxy (custom headers).
            "CF-Access-Client-Secret": "proxy-secret",
          },
        },
      ),
    );
    writeErrorLog("Library play queue failed to start", error);

    const stored = JSON.stringify(readFromLog());
    for (const secret of [
      "token-in-header",
      "token-in-emby-header",
      "proxy-secret",
      "key-in-url",
    ]) {
      expect(stored).not.toContain(secret);
    }
    expect(readFromLog()[0].data).toMatchObject({
      message: "Network Error",
      code: "ERR_NETWORK",
      url: "https://jellyfin.example.test/Users/user-1/Items",
    });
  });

  test("a failed sign-in keeps the password out", async () => {
    const error = await failureOf(
      unreachable.post(
        "https://jellyfin.example.test/Users/AuthenticateByName",
        { Username: "mobile", Pw: "password-in-body" },
      ),
    );
    writeErrorLog("Login failed", error);

    expect(JSON.stringify(readFromLog())).not.toContain("password-in-body");
    // An empty log keeps the password out too: the entry has to be there.
    expect(readFromLog()[0]).toMatchObject({
      message: "Login failed",
      data: { message: "Network Error", code: "ERR_NETWORK" },
    });
  });

  // AxiosError.from keeps the original error's status when no response came with it.
  test("a failed request without a response keeps its status", () => {
    const error = AxiosError.from(
      Object.assign(new Error("Service Unavailable"), { status: 503 }),
      AxiosError.ERR_BAD_RESPONSE,
    );
    writeErrorLog("Library play queue failed to start", error);

    expect(readFromLog()[0].data).toMatchObject({
      code: "ERR_BAD_RESPONSE",
      status: 503,
    });
  });

  // A plain Error used to be stored as {}: message and stack are not enumerable.
  test("an error that is not a request keeps its message", () => {
    writeErrorLog("Storage migration 12 failed", new Error("disk full"));

    expect(readFromLog()[0].data).toMatchObject({
      name: "Error",
      message: "disk full",
    });
  });

  test("data that is not an error is stored as it came", () => {
    writeErrorLog("Download turned down", { itemId: "item-1", reason: "none" });

    expect(readFromLog()[0].data).toEqual({ itemId: "item-1", reason: "none" });
  });

  test("an error a caller wraps in an object is reduced too", async () => {
    const error = await failureOf(
      unreachable.get("https://jellyfin.example.test/Items", {
        headers: { Authorization: 'MediaBrowser Token="token-in-header"' },
      }),
    );
    writeErrorLog("Sync failed", { itemId: "item-1", error });

    expect(JSON.stringify(readFromLog())).not.toContain("token-in-header");
    expect(readFromLog()[0].data).toMatchObject({
      itemId: "item-1",
      error: { message: "Network Error", code: "ERR_NETWORK" },
    });
  });

  // Rebuilding an object drops a toJSON that is not enumerable, and with it
  // what that toJSON leaves out, so one that holds no error is left whole.
  test("data that holds no error keeps its own JSON", () => {
    const summary = {
      itemId: "item-1",
      Authorization: 'MediaBrowser Token="token-in-field"',
    };
    Object.defineProperty(summary, "toJSON", {
      value: () => ({ itemId: "item-1" }),
    });
    writeErrorLog("Sync failed", summary);

    expect(JSON.stringify(readFromLog())).not.toContain("token-in-field");
    expect(readFromLog()[0].data).toEqual({ itemId: "item-1" });
  });

  // A wrapper is read through its own toJSON, as storage would read it: what
  // that leaves out stays out, and an error it hands back is still reduced.
  test("a wrapper with its own toJSON is read through it, then reduced", async () => {
    const error = await failureOf(
      unreachable.get("https://jellyfin.example.test/Items", {
        headers: { Authorization: 'MediaBrowser Token="token-in-header"' },
      }),
    );
    const hidden = {
      itemId: "item-1",
      Authorization: 'MediaBrowser Token="token-in-field"',
      error,
    };
    Object.defineProperty(hidden, "toJSON", {
      value: () => ({ itemId: "item-1", error }),
    });
    const handedBack = { itemId: "item-2", error, toJSON: () => ({ error }) };
    writeErrorLog("Sync failed", hidden);
    writeErrorLog("Sync failed", handedBack);

    const stored = JSON.stringify(readFromLog());
    expect(stored).not.toContain("token-in-header");
    expect(stored).not.toContain("token-in-field");
    expect(readFromLog().map((entry) => entry.data)).toMatchObject([
      { itemId: "item-1", error: { message: "Network Error" } },
      { error: { message: "Network Error" } },
    ]);
  });

  // axios sets isAxiosError on the error itself, so a spread copy still is one,
  // config and headers included, while being a plain object.
  test("a copy of a failed request is reduced like the request", async () => {
    const error = await failureOf(
      unreachable.get("https://jellyfin.example.test/Items", {
        headers: { Authorization: 'MediaBrowser Token="token-in-header"' },
      }),
    );
    writeErrorLog("Sync failed", { ...(error as object) });
    logAndCaptureError("Sync failed", { ...(error as object) });

    expect(JSON.stringify(readFromLog())).not.toContain("token-in-header");
    expect(readFromLog().map((entry) => entry.data)).toMatchObject([
      { message: "Network Error", code: "ERR_NETWORK" },
      { message: "Network Error", code: "ERR_NETWORK" },
    ]);
  });

  test("errors in a list are reduced one by one", async () => {
    const error = await failureOf(
      unreachable.get("https://jellyfin.example.test/Items", {
        headers: { Authorization: 'MediaBrowser Token="token-in-header"' },
      }),
    );
    writeErrorLog("Some syncs failed", [error, "item-2"]);

    expect(JSON.stringify(readFromLog())).not.toContain("token-in-header");
    expect(readFromLog()[0].data).toMatchObject([
      { message: "Network Error" },
      "item-2",
    ]);
  });

  // Callers log from their catch blocks: the logger itself must never throw.
  // Storing the value unreduced instead could keep what reduction drops.
  test("data that throws when read is stored as unrenderable", () => {
    const data = {
      itemId: "item-1",
      get detail(): string {
        throw new Error("detail is gone");
      },
    };

    expect(() => writeErrorLog("Sync failed", data)).not.toThrow();
    expect(() => logAndCaptureError("Sync failed", data)).not.toThrow();
    expect(readFromLog()).toMatchObject([
      { message: "Sync failed", data: "[unrenderable]" },
      { message: "Sync failed", data: "[unrenderable]" },
    ]);
  });

  test("logAndCaptureError reduces a wrapped error the same way", async () => {
    const error = await failureOf(
      unreachable.get("https://jellyfin.example.test/Items", {
        headers: { Authorization: 'MediaBrowser Token="token-in-header"' },
      }),
    );
    logAndCaptureError("Sync failed", { itemId: "item-1", error });

    expect(JSON.stringify(readFromLog())).not.toContain("token-in-header");
    expect(readFromLog()[0]).toMatchObject({
      message: "Sync failed",
      data: {
        itemId: "item-1",
        error: { message: "Network Error", code: "ERR_NETWORK" },
      },
    });
  });
});

describe("logAndCaptureError — what is kept local", () => {
  test("an expected outcome is logged and not sent", () => {
    logAndCaptureError("Login failed", markExpectedError(new Error("nope")));
    expect(mockCaptured).toHaveLength(0);
    expect(readFromLog().map((entry) => entry.message)).toEqual([
      "Login failed",
    ]);
  });

  // REACT-NATIVE-2X: a token that expired mid-session failed whichever
  // request was in flight, and each call site that logged it opened an issue
  // for what is the user being signed out.
  test("a 401 is the session ending and is not sent", () => {
    logAndCaptureError(
      "Fetching remote item during playback sync failed",
      httpError(newServer(), "/Items/abc", 401),
    );
    expect(mockCaptured).toHaveLength(0);
    expect(readFromLog()).toHaveLength(1);
  });

  test("a Cloudflare tunnel that is down is not sent", () => {
    logAndCaptureError("Sessions", httpError(newServer(), "/Sessions", 530));
    expect(mockCaptured).toHaveLength(0);
  });

  test("a gateway's own 403 page is not sent", () => {
    logAndCaptureError(
      "Sessions",
      httpError(newServer(), "/Sessions", 403, { "content-type": "text/html" }),
    );
    expect(mockCaptured).toHaveLength(0);
  });

  test("a gateway's 403 page is not sent when no content type announces it", () => {
    logAndCaptureError(
      "Sessions",
      httpError(
        newServer(),
        "/Sessions",
        403,
        {},
        "<!DOCTYPE html><html><title>Access denied</title>",
      ),
    );
    expect(mockCaptured).toHaveLength(0);
  });

  // The body is read to tell whose refusal it is, and for nothing else: an
  // error page can name the user's server.
  test("the body of a 403 that is sent does not go with it", () => {
    logAndCaptureError(
      "Sessions",
      httpError(
        newServer(),
        "/Sessions",
        403,
        { "content-type": "text/plain" },
        "Forbidden for my-private-host.example.org",
      ),
    );
    expect(mockCaptured).toHaveLength(1);
    const { contexts, fingerprint } = mockCaptured[0];
    expect(JSON.stringify({ contexts, fingerprint })).not.toContain(
      "my-private-host",
    );
    expect(contexts).toEqual({
      http: { method: "GET", path: "/Sessions", status: 403 },
      http_response: {
        status: 403,
        contentType: "text/plain",
        bodyKind: "text",
        bodyLength: 41,
      },
    });
  });

  test("a 403 from the server itself is sent", () => {
    logAndCaptureError(
      "Sessions",
      httpError(newServer(), "/Sessions", 403, {
        "content-type": "application/json",
      }),
    );
    expect(mockCaptured).toHaveLength(1);
  });
});

// A library renamed or deleted: ids restored from an earlier session's cache,
// which the server answers as unknown.
describe("logAndCaptureError for an id the server no longer has", () => {
  const STALE = "5e1c0f9d2b7a4c38a6e2d4f1b3c5a7e9";

  test("is logged and not sent", () => {
    logAndCaptureError(
      "Loading the library failed",
      httpError(
        newServer(),
        `/Items?userId=u1&parentId=${STALE}&recursive=true`,
        400,
        { "content-type": "text/plain", server: "Kestrel" },
        "Error processing request.",
      ),
    );
    expect(mockCaptured).toHaveLength(0);
    expect(readFromLog().map((entry) => entry.message)).toEqual([
      "Loading the library failed",
    ]);
  });

  test("the same statuses for anything else are still sent", () => {
    logAndCaptureError(
      "Loading the library failed",
      httpError(
        newServer(),
        "/Items?parentId=abc",
        400,
        { "content-type": "application/problem+json" },
        {
          status: 400,
          errors: { parentId: ["The value 'abc' is not valid."] },
        },
      ),
    );
    logAndCaptureError(
      "Loading the item failed",
      httpError(newServer(), `/Items/${STALE}`, 404),
    );
    expect(mockCaptured).toHaveLength(2);
  });

  // Jellyfin answers it for any id that is not a series the user can see,
  // the id of an episode the app passed by mistake among them.
  test("a series' 404 is still sent", () => {
    logAndCaptureError(
      "Loading the episodes failed",
      httpError(
        newServer(),
        `/Shows/${STALE}/Episodes?userId=u1`,
        404,
        { "content-type": "application/json; charset=utf-8" },
        "Series not found",
      ),
    );
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].fingerprint).toEqual([
      "Loading the episodes failed",
      "GET",
      "/Shows/:id/Episodes",
      "404",
    ]);
  });
});

describe("logAndCaptureError — what goes with an HTTP failure", () => {
  // A 400 on a Jellyfin route reads the same in Sentry whether the app sent
  // a parameter the server does not know or a proxy refused the request.
  // Who answered, and which parameters it named, is what tells them apart.
  test("the server's answer is described next to the route", () => {
    logAndCaptureError(
      "Fetching items failed",
      httpError(
        newServer(),
        "/Items",
        400,
        { "content-type": "application/problem+json", server: "Kestrel" },
        {
          title: "One or more validation errors occurred.",
          status: 400,
          errors: { sortBy: ["The value 'Foo' is not valid."] },
        },
      ),
    );
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].contexts.http_response).toEqual({
      status: 400,
      contentType: "application/problem+json",
      server: "Kestrel",
      bodyKind: "json",
      bodyKeys: ["title", "status", "errors"],
      errorFields: ["sortBy"],
    });
  });
});

describe("logAndCaptureError — one event per failure", () => {
  // "NativePlayer config build failed" and "Failed to fetch item for player"
  // were two issues every time: the native player and the JS player each
  // caught the failure of the same request and logged it under its own name.
  test("the same error caught by two layers is sent once", () => {
    const error = new Error("decoder exploded");
    logAndCaptureError("Inner layer failed", error);
    logAndCaptureError("Outer layer failed", error);
    expect(mockCaptured).toHaveLength(1);
    // The second layer's line is still in the local log.
    expect(readFromLog().map((entry) => entry.message)).toEqual([
      "Inner layer failed",
      "Outer layer failed",
    ]);
  });

  test("two requests failing alike under two messages are sent once", () => {
    const server = newServer();
    logAndCaptureError(
      "NativePlayer config build failed",
      httpError(server, "/Users/1/Items/2", 500),
    );
    logAndCaptureError(
      "Failed to fetch item for player",
      httpError(server, "/Users/1/Items/2", 500),
    );
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].fingerprint).toEqual([
      "NativePlayer config build failed",
      "GET",
      "/Users/:id/Items/:id",
      "500",
    ]);
  });

  test("an error that was held back is marked, so nobody else sends it", () => {
    const server = newServer();
    logAndCaptureError("Home", httpError(server, "/Items", 500));
    const second = httpError(server, "/UserViews", 500);
    logAndCaptureError("Home", second);
    expect(mockCaptured).toHaveLength(1);
    expect(isErrorReported(second)).toBe(true);
  });

  test("a route failing on its own is sent, whatever its status", () => {
    for (const status of [400, 404, 500]) {
      logAndCaptureError("Details", httpError(newServer(), "/Items", status));
    }
    expect(mockCaptured).toHaveLength(3);
  });
});

describe("logAndCaptureError — native error strings", () => {
  // REACT-NATIVE-7Q: one user, 58 events in forty minutes, one per queued
  // episode refused with the same status.
  test("the same string is sent once per session", () => {
    for (let episode = 0; episode < 58; episode++) {
      logAndCaptureError("Download failed (test A)", "HTTP error: 403");
    }
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].fingerprint).toEqual([
      "Download failed (test A)",
      "HTTP error: 403",
    ]);
  });

  test("a different string under the same message is its own event", () => {
    logAndCaptureError("Download failed (test B)", "HTTP error: 403");
    logAndCaptureError("Download failed (test B)", "HTTP error: 500");
    expect(mockCaptured).toHaveLength(2);
  });

  // Every event had its own pointer, so every event was its own issue.
  test("a pointer in the message does not make a new failure of it", () => {
    logAndCaptureError(
      "Stream failed (test C)",
      "Read error: ssl=0xb400007329635958: Failure in SSL library",
    );
    logAndCaptureError(
      "Stream failed (test C)",
      "Read error: ssl=0xb4000073296a1c18: Failure in SSL library",
    );
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].fingerprint).toEqual([
      "Stream failed (test C)",
      "Read error: ssl=0x[addr]: Failure in SSL library",
    ]);
    expect((mockCaptured[0].exception as Error).message).toBe(
      "Stream failed (test C): Read error: ssl=0x[addr]: Failure in SSL library",
    );
  });

  test("no detail at all is grouped by the message alone, once", () => {
    logAndCaptureError("Gave up (test D)", null);
    logAndCaptureError("Gave up (test D)", null);
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].fingerprint).toEqual(["Gave up (test D)"]);
  });
});

describe("normalizeNativeDetail", () => {
  test("replaces heap addresses", () => {
    expect(normalizeNativeDetail("ssl=0xb400007329635958: x")).toBe(
      "ssl=0x[addr]: x",
    );
    expect(normalizeNativeDetail("at 0x000000010a3f4c20")).toBe("at 0x[addr]");
  });

  test("keeps error codes, which are the diagnosis", () => {
    expect(normalizeNativeDetail("MediaCodec error 0x80001001")).toBe(
      "MediaCodec error 0x80001001",
    );
    expect(normalizeNativeDetail("HTTP error: 500")).toBe("HTTP error: 500");
  });
});
