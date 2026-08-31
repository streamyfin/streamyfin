import { isAxiosError, isCancel } from "axios";

/**
 * Marks errors that are user-facing outcomes rather than app defects — a
 * wrong password, a denied permission — so the global React Query error
 * reporting in app/_layout.tsx doesn't send them to Sentry. The underlying
 * technical failure should already have been logged (writeErrorLog /
 * logAndCaptureError) before the marked error is thrown for the UI.
 */
const EXPECTED_ERROR = Symbol.for("streamyfin.expectedError");

export const markExpectedError = <T>(error: T): T => {
  if (error !== null && typeof error === "object") {
    (error as Record<symbol, unknown>)[EXPECTED_ERROR] = true;
  }
  return error;
};

/**
 * Marks errors that have already been sent to Sentry (by logAndCaptureError)
 * so the global React Query handler doesn't report them a second time when
 * they're rethrown into a query/mutation.
 */
const REPORTED_ERROR = Symbol.for("streamyfin.reportedError");

export const markErrorReported = <T>(error: T): T => {
  if (error !== null && typeof error === "object") {
    (error as Record<symbol, unknown>)[REPORTED_ERROR] = true;
  }
  return error;
};

export const isErrorReported = (error: unknown): boolean =>
  error !== null &&
  typeof error === "object" &&
  (error as Record<symbol, unknown>)[REPORTED_ERROR] === true;

// expo/fetch rejects a cancelled request with a plain Error whose message
// carries the native exception name, not with an AbortError — without this
// match a timeout abort or an iOS backgrounding cancel reads as a failure.
const FETCH_CANCEL_PATTERN =
  /FetchRequestCanceledException|fetch request has been canceled/i;

/** True for cancelled/aborted requests (navigation away, new keystroke) —
 * routine control flow that should never be reported as a failure. */
export const isAbortLikeError = (error: unknown): boolean =>
  isCancel(error) ||
  (error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "CanceledError" ||
      FETCH_CANCEL_PATTERN.test(error.message)));

// A gateway status means the reverse proxy in front of Jellyfin answered but
// Jellyfin itself did not (container down, restarting, upstream timeout) —
// from the app's side that is an unreachable server, not an app bug. 521-523
// are Cloudflare's spellings of the same thing (origin down/unreachable); one
// origin-down blip otherwise fans out into one issue per in-flight route.
const GATEWAY_STATUSES = new Set([502, 503, 504, 521, 522, 523]);

/**
 * True for requests that never got a usable HTTP response — the server is
 * unreachable (LAN-only server while roaming, DNS failure, timeout) or its
 * proxy could not reach it. That is the user's environment, not an app bug,
 * so it must never become a Sentry event. Covers both axios errors and React
 * Native's fetch TypeError.
 */
export const isConnectivityError = (error: unknown): boolean => {
  if (isAxiosError(error)) {
    return !error.response || GATEWAY_STATUSES.has(error.response.status);
  }
  return (
    error instanceof TypeError && /network request failed/i.test(error.message)
  );
};

export const isExpectedError = (error: unknown): boolean =>
  error !== null &&
  typeof error === "object" &&
  (error as Record<symbol, unknown>)[EXPECTED_ERROR] === true;

// Path segments that identify a record rather than name a route: GUIDs (with
// or without dashes), hex hashes and bare numbers.
const ID_SEGMENT =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;
// Anything else that isn't a plain route word (URL-encoded names, search
// text, filenames) is a parameter too.
const ROUTE_WORD = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Reduces a request URL to its route shape: origin and query string dropped,
 * record identifiers and free-text segments replaced by placeholders.
 * "https://host/Users/3f2a…/Items/12?api_key=x" → "/Users/:id/Items/:id".
 * Stable across users and items, so it can key grouping and dedupe without
 * carrying the user's server address or what they were looking at.
 */
export const templateRequestPath = (url: string | undefined): string => {
  if (!url) return "?";
  const path = url
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
    .split(/[?#]/)[0];
  return path
    .split("/")
    .map((segment) => {
      if (segment === "") return segment;
      if (ID_SEGMENT.test(segment)) return ":id";
      if (!ROUTE_WORD.test(segment)) return ":param";
      return segment;
    })
    .join("/");
};

export type HttpErrorDescription = {
  method: string;
  path: string;
  status: number;
};

/**
 * The route-level identity of a failed HTTP request, for grouping: an
 * AxiosError is constructed inside axios, so its stack trace has no app
 * frames and Sentry would otherwise file every HTTP failure in the app — any
 * endpoint, any status, any call site — under one issue. Null when the
 * error isn't an HTTP response (not axios, or no response at all).
 */
export const describeHttpError = (
  error: unknown,
): HttpErrorDescription | null => {
  if (!isAxiosError(error) || !error.response) return null;
  return {
    method: (error.config?.method ?? "?").toUpperCase(),
    path: templateRequestPath(error.config?.url),
    status: error.response.status,
  };
};

const MAX_RESPONSE_BODY_CHARS = 200;

/**
 * What the server said about a rejected request — enough to tell a Jellyfin
 * rejection apart from a proxy one: Jellyfin answers with a text/plain
 * reason ("Session not found.") and `Server: Kestrel`; proxies answer with
 * their own Server header and an HTML page. The body is only kept when it is
 * plain text or JSON, and truncated: an HTML error page can embed the proxy's
 * hostname, which is the user's private server address.
 */
export const describeHttpResponse = (
  error: unknown,
): Record<string, unknown> | undefined => {
  if (!isAxiosError(error) || !error.response) return undefined;
  const headers = error.response.headers ?? {};
  const contentType = headers["content-type"];
  const server = headers.server;
  let body: string | undefined;
  if (
    /^(?:text\/plain|application\/(?:problem\+)?json)/i.test(
      String(contentType ?? ""),
    )
  ) {
    const data = error.response.data;
    try {
      body = typeof data === "string" ? data : JSON.stringify(data);
    } catch {
      body = undefined;
    }
    body = body?.slice(0, MAX_RESPONSE_BODY_CHARS);
  }
  return {
    status: error.response.status,
    contentType: contentType ? String(contentType) : undefined,
    server: server ? String(server) : undefined,
    body,
  };
};
