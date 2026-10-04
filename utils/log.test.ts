// Only what reaches Sentry is under test: the SDK is replaced by a recorder
// that plays the scope back, and the local log writes into the MMKV double.
type Captured = {
  exception: unknown;
  fingerprint?: string[];
  contexts: Record<string, unknown>;
};
const mockCaptured: Captured[] = [];
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
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

import { AxiosError, type AxiosResponse } from "axios";
import { clearMmkv } from "@/test-utils/mmkv";
import { isErrorReported, markExpectedError } from "./errors";
import { logAndCaptureError, normalizeNativeDetail, readFromLog } from "./log";

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

describe("logAndCaptureError — what is kept local", () => {
  test("an expected outcome is logged and not sent", () => {
    logAndCaptureError("Login failed", markExpectedError(new Error("nope")));
    expect(mockCaptured).toHaveLength(0);
    expect(readFromLog().map((entry) => entry.message)).toEqual([
      "Login failed",
    ]);
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
