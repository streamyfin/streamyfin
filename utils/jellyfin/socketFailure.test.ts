const mockReported: [string, unknown][] = [];
const mockLogged: [string, string, unknown][] = [];
jest.mock("@/utils/log", () => ({
  logAndCaptureError: (message: string, error: unknown) => {
    mockReported.push([message, error]);
  },
  writeToLog: (level: string, message: string, data: unknown) => {
    mockLogged.push([level, message, data]);
  },
}));

import {
  createSocketFailureRecorder,
  describeSocketFailure,
  reportSocketGiveUp,
} from "./socketFailure";

beforeEach(() => {
  mockReported.length = 0;
  mockLogged.length = 0;
});

// REACT-NATIVE-6: 43 users, typically 42 seconds after a cold start, which
// is six sockets failing in a row while HTTP works: a reverse proxy that
// does not forward the upgrade.
describe("describeSocketFailure — a proxy that refuses the upgrade", () => {
  test("OkHttp's wording, on Android", () => {
    expect(
      describeSocketFailure(
        "Expected HTTP 101 response but was '404 Not Found'",
        1006,
      ),
    ).toEqual({ cause: "handshake-http-404", environment: true });
    expect(
      describeSocketFailure(
        "Expected HTTP 101 response but was '502 Bad Gateway'",
      ),
    ).toEqual({ cause: "handshake-http-502", environment: true });
  });

  test("SocketRocket's wording, on iOS and tvOS", () => {
    expect(
      describeSocketFailure("Received bad response code from server: 403."),
    ).toEqual({ cause: "handshake-http-403", environment: true });
  });

  // A 200 or a redirect is not a refusal: something answered the request as
  // if it were a page, which may be the app asking at the wrong address.
  test("an answer that is not an error is told apart and reported", () => {
    expect(
      describeSocketFailure("Expected HTTP 101 response but was '200 OK'"),
    ).toEqual({ cause: "handshake-http-200", environment: false });
    expect(
      describeSocketFailure("Received bad response code from server: 301."),
    ).toEqual({ cause: "handshake-http-301", environment: false });
  });
});

describe("describeSocketFailure — everything else is split by cause", () => {
  test.each([
    ["Invalid Sec-WebSocket-Accept response.", "handshake-invalid"],
    ["javax.net.ssl.SSLHandshakeException: Handshake failed", "tls"],
    ["Trust anchor for certification path not found.", "tls"],
    ["The request timed out.", "timeout"],
    ['Unable to resolve host "jellyfin.example.com"', "dns"],
    ["Failed to connect to jellyfin.example.com/10.0.0.5:8096", "connection"],
    ["Connection reset", "connection"],
    [
      "The operation couldn’t be completed. Socket is not connected",
      "connection",
    ],
  ])("%s → %s", (message, cause) => {
    expect(describeSocketFailure(message, 1006)).toEqual({
      cause,
      environment: false,
    });
  });

  test("a close code is used when the message says nothing", () => {
    expect(describeSocketFailure(undefined, 1011)).toEqual({
      cause: "close-1011",
      environment: false,
    });
    expect(describeSocketFailure("", 1008)).toEqual({
      cause: "close-1008",
      environment: false,
    });
  });

  // React Native puts 1006 on every failed socket.
  test("the code every failure carries is not a cause", () => {
    expect(describeSocketFailure(undefined, 1006)).toEqual({
      cause: "unknown",
      environment: false,
    });
    expect(describeSocketFailure(undefined, undefined)).toEqual({
      cause: "unknown",
      environment: false,
    });
  });

  test("a message nothing recognises is named as such", () => {
    expect(
      describeSocketFailure("Unexpected char 0x0a in header", 1006),
    ).toEqual({ cause: "other", environment: false });
  });
});

// The socket URL carries the ApiKey, and the native message can quote the
// host and the headers the user set for their proxy.
describe("describeSocketFailure — nothing of the message is passed on", () => {
  const SECRETS = [
    "jellyfin.example.com",
    "10.0.0.5",
    "SECRETKEY",
    "X-Proxy-Auth",
    "hunter2",
  ];

  test.each([
    "Failed to connect to jellyfin.example.com/10.0.0.5:8096",
    'Unable to resolve host "jellyfin.example.com": No address',
    "wss://jellyfin.example.com/socket?ApiKey=SECRETKEY&deviceId=abc refused",
    "Unexpected char 0x0a at 7 in X-Proxy-Auth value: hunter2",
    "Expected HTTP 101 response but was '403 Forbidden by jellyfin.example.com'",
  ])("%s", (message) => {
    const { cause } = describeSocketFailure(message, 1006);
    for (const secret of SECRETS) expect(cause).not.toContain(secret);
    expect(cause).toMatch(/^[a-z]+(?:-[a-z]+)*(?:-\d+)?$/);
  });

  test("a message that is not a string is not read at all", () => {
    expect(
      describeSocketFailure(
        { url: "wss://host/socket?ApiKey=SECRETKEY" },
        1006,
      ),
    ).toEqual({ cause: "unknown", environment: false });
  });
});

describe("createSocketFailureRecorder — where the reason arrives", () => {
  const REFUSED = "Expected HTTP 101 response but was '404 Not Found'";

  // React Native 0.86: `new Event("error")`, then a CloseEvent with the
  // native message as its reason.
  test("on the close event that follows an empty error event", () => {
    const failure = createSocketFailureRecorder();
    failure.error({ type: "error" });
    failure.close({ type: "close", code: 1006, reason: REFUSED });
    expect(failure.describe()).toEqual({
      cause: "handshake-http-404",
      environment: true,
    });
  });

  test("on the error event itself, where a runtime still puts it there", () => {
    const failure = createSocketFailureRecorder();
    failure.error({ type: "error", message: REFUSED });
    failure.close({ type: "close", code: 1006, reason: "" });
    expect(failure.describe().cause).toBe("handshake-http-404");
  });

  test("before the close event has come, the cause is not known yet", () => {
    const failure = createSocketFailureRecorder();
    failure.error({ type: "error" });
    expect(failure.describe().cause).toBe("unknown");
  });

  test("a close the server asked for is named by its code", () => {
    const failure = createSocketFailureRecorder();
    failure.close({ type: "close", code: 1011, reason: "" });
    expect(failure.describe().cause).toBe("close-1011");
  });

  test("events without a body do not throw", () => {
    const failure = createSocketFailureRecorder();
    failure.error(undefined);
    failure.close(null);
    expect(failure.describe().cause).toBe("unknown");
  });
});

describe("reportSocketGiveUp", () => {
  test("a proxy that refuses the upgrade stays in the local log", () => {
    reportSocketGiveUp({ cause: "handshake-http-404", environment: true });
    expect(mockReported).toHaveLength(0);
    expect(mockLogged).toEqual([
      [
        "WARN",
        "WebSocket upgrade refused by the server's proxy",
        "handshake-http-404",
      ],
    ]);
  });

  test("anything else is reported under its cause", () => {
    reportSocketGiveUp({ cause: "tls", environment: false });
    expect(mockReported).toEqual([
      ["WebSocket gave up reconnecting while server is reachable", "tls"],
    ]);
    expect(mockLogged).toHaveLength(0);
  });
});
