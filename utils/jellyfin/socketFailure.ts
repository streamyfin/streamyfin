import { logAndCaptureError, writeToLog } from "@/utils/log";

/**
 * Why a WebSocket failed, as far as it can be said without repeating what the
 * native layer wrote:
 * - `cause` is built from a fixed vocabulary plus numbers (an HTTP status, a
 *   close code), so it is safe to send and stable enough to group by.
 * - `environment` is true when the cause is the user's proxy and not the app.
 */
export type SocketFailure = { cause: string; environment: boolean };

// The answer to the upgrade request when it was not "101 Switching
// Protocols": OkHttp on Android, SocketRocket on Apple platforms.
const HANDSHAKE_STATUS_PATTERNS = [
  /Expected HTTP 101 response but was '(\d{3})/i,
  /bad response code from server:? ?(\d{3})/i,
];

// Coarse classes for everything else. Order matters: a TLS failure also
// mentions the connection, and a malformed upgrade answer the handshake.
const CAUSE_PATTERNS: [string, RegExp][] = [
  ["handshake-invalid", /Sec-WebSocket/i],
  ["tls", /\bssl\b|\btls\b|certificate|handshake|trust anchor/i],
  ["timeout", /time.?out|timed out/i],
  ["dns", /resolve host|hostname|nodename nor servname|\bdns\b/i],
  [
    "connection",
    /connect|refused|unreachable|reset|network|socket|broken pipe|closed|\beof\b|end of stream/i,
  ],
];

// 1006 is what React Native puts on the close event of every failed socket,
// so it says nothing; the rest are the protocol's own codes.
const CLOSE_ABNORMAL = 1006;

/**
 * Reduces a failed socket to its cause.
 *
 * The native message is only ever matched against, never passed on: it can
 * quote the server's host name ("Unable to resolve host …"), and a header the
 * user configured for their proxy, name and value. The socket URL, which
 * carries the ApiKey, is not looked at here at all.
 *
 * A 4xx or 5xx answer to the upgrade request while the server's HTTP API
 * works is a reverse proxy that does not forward WebSocket upgrades: the
 * server never saw a socket to accept. That is the user's proxy
 * configuration, not something the app can change.
 */
export const describeSocketFailure = (
  message: unknown,
  closeCode?: unknown,
): SocketFailure => {
  const text = typeof message === "string" ? message : "";
  for (const pattern of HANDSHAKE_STATUS_PATTERNS) {
    const status = Number(pattern.exec(text)?.[1]);
    if (status) {
      return {
        cause: `handshake-http-${status}`,
        environment: status >= 400,
      };
    }
  }
  for (const [cause, pattern] of CAUSE_PATTERNS) {
    if (pattern.test(text)) return { cause, environment: false };
  }
  if (
    typeof closeCode === "number" &&
    Number.isInteger(closeCode) &&
    closeCode > 0 &&
    closeCode !== CLOSE_ABNORMAL
  ) {
    return { cause: `close-${closeCode}`, environment: false };
  }
  return { cause: text ? "other" : "unknown", environment: false };
};

/**
 * Collects, from one socket's events, what describeSocketFailure needs.
 *
 * React Native's error event carries nothing: the native message arrives as
 * the `reason` of the close event dispatched right after it, under code 1006.
 * Older versions put it on the error event as `message`, which wins when it
 * is there. So the cause is only known once both events have been seen, and
 * `describe` is to be called after them, not from the error handler.
 */
export const createSocketFailureRecorder = () => {
  let message: unknown;
  let closeCode: unknown;
  return {
    error: (event: unknown) => {
      message = (event as { message?: unknown } | null)?.message ?? message;
    },
    close: (event: unknown) => {
      const close = event as { reason?: unknown; code?: unknown } | null;
      message ??= close?.reason;
      closeCode = close?.code;
    },
    describe: (): SocketFailure => describeSocketFailure(message, closeCode),
  };
};

/**
 * Reports that the socket was given up on although the server answers HTTP,
 * which silently kills remote control and live updates until the next app
 * foreground. Grouped by cause, so that a bug in the app's own handling does
 * not hide among the proxies that drop the upgrade; those stay in the local
 * log, where a user looking for why remote control is dead can find them.
 */
export const reportSocketGiveUp = (failure: SocketFailure): void => {
  if (failure.environment) {
    writeToLog(
      "WARN",
      "WebSocket upgrade refused by the server's proxy",
      failure.cause,
    );
    return;
  }
  logAndCaptureError(
    "WebSocket gave up reconnecting while server is reachable",
    failure.cause,
  );
};
