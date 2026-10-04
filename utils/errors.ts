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
// from the app's side that is an unreachable server, not an app bug. The 52x
// and 530 codes are Cloudflare's own, which no origin ever sends, each one a
// way of saying that Cloudflare could not get an answer out of the origin:
// - 520: the origin answered with something empty or unreadable
// - 521: the origin refused the connection (web server down)
// - 522: the connection to the origin timed out
// - 523: the origin is unreachable (routing, DNS)
// - 524: the origin accepted the connection and then never answered
// - 525: the TLS handshake between Cloudflare and the origin failed
// - 526: the origin's certificate is not valid
// - 530: sent with a 1xxx error page, in practice 1033, a Cloudflare Tunnel
//   that is not running
// One origin-down blip otherwise fans out into one issue per in-flight route.
const GATEWAY_STATUSES = new Set([
  502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530,
]);

/** Whether a status is a proxy's way of saying the server did not answer. */
export const isGatewayStatus = (status: number): boolean =>
  GATEWAY_STATUSES.has(status);

/**
 * True for requests that never got a usable HTTP response — the server is
 * unreachable (LAN-only server while roaming, DNS failure, timeout) or its
 * proxy could not reach it. That is the user's environment, not an app bug,
 * so it must never become a Sentry event. Covers both axios errors and React
 * Native's fetch TypeError.
 */
export const isConnectivityError = (error: unknown): boolean => {
  if (isAxiosError(error)) {
    return !error.response || isGatewayStatus(error.response.status);
  }
  return (
    error instanceof TypeError && /network request failed/i.test(error.message)
  );
};

// How far into a body the HTML check reads: room for a byte order mark, some
// leading whitespace and the opening tag, and no more. An error page can be
// large and this runs for every 403.
const HTML_SNIFF_CHARS = 256;

// The start of an HTML document: "<!doctype html" or "<html", in any case,
// after optional whitespace (which in a JS regex includes the byte order
// mark). The lookahead keeps "<htmlfoo" out.
const HTML_DOCUMENT_START = /^\s*<(?:!doctype\s+html|html)(?=[\s>])/i;

const HTML_CONTENT_TYPE = /^text\/html\b/i;

const isHtmlDocument = (body: unknown): boolean =>
  typeof body === "string" &&
  HTML_DOCUMENT_START.test(body.slice(0, HTML_SNIFF_CHARS));

/**
 * True for a 403 that a gateway in front of the server sent in the server's
 * place: a WAF rule, Cloudflare Access, a geo block. Told apart by the body,
 * which is the gateway's HTML page; Jellyfin and Seerr refuse with JSON,
 * plain text or nothing at all, and the app asks neither for HTML. Once such
 * a block is up every route answers the same way, and none of it is
 * something the app can act on.
 *
 * The page is recognised by its content type, or, since a gateway does not
 * always label its page and sometimes labels it wrong, by the body starting
 * as an HTML document. The body is only looked at here: it never goes onto
 * an event, as an error page can name the user's server.
 *
 * Only 403: a 404 or a 500 with an HTML body can still be the app asking for
 * the wrong path, which is worth a report.
 */
export const isGatewayBlockError = (error: unknown): boolean => {
  if (!isAxiosError(error) || error.response?.status !== 403) return false;
  const contentType = error.response.headers?.["content-type"];
  return (
    HTML_CONTENT_TYPE.test(String(contentType ?? "")) ||
    isHtmlDocument(error.response.data)
  );
};

/**
 * True for a failure that comes from where the user is and what stands
 * between them and their server, rather than from the app: no answer, a
 * gateway that could not reach the server, or a gateway that refused the
 * request itself. Logged locally, never reported.
 */
export const isEnvironmentError = (error: unknown): boolean =>
  isConnectivityError(error) || isGatewayBlockError(error);

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

// The reasons a server gives in fixed words: the same sentence for every
// user, so it says who answered and nothing about whom it answered. Only
// these are quoted. A reason goes on the list once it is known to be fixed,
// by the server's source and not by having seen it twice.
const FIXED_RESPONSE_REASONS: ReadonlySet<string> = new Set([
  // Jellyfin's ExceptionMiddleware, for any exception outside development
  // mode. In development mode it sends the exception message instead, which
  // can hold a library path.
  "Error processing request.",
]);

// A top-level key that reads as a field name ("title", "traceId", "ray_id").
// An object keyed by something the server chose (a host, a path, a name) is
// data, and its keys do not pass.
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const MAX_RESPONSE_BODY_KEYS = 12;

type ResponseBodyDescription = {
  bodyKind: "empty" | "html" | "text" | "json" | "other";
  /** Characters in a text or HTML body. */
  bodyLength?: number;
  /** The field names of a JSON object, in the order they came. */
  bodyKeys?: string[];
  /** The body itself, only when it is one of FIXED_RESPONSE_REASONS. */
  body?: string;
};

export type HttpResponseDescription = ResponseBodyDescription & {
  status: number;
  contentType?: string;
  server?: string;
};

const describeResponseBody = (
  data: unknown,
  contentType: string,
): ResponseBodyDescription => {
  if (data === undefined || data === null || data === "") {
    return { bodyKind: "empty" };
  }
  if (typeof data === "string") {
    if (HTML_CONTENT_TYPE.test(contentType) || isHtmlDocument(data)) {
      return { bodyKind: "html", bodyLength: data.length };
    }
    const reason = data.trim();
    return {
      bodyKind: "text",
      bodyLength: data.length,
      ...(FIXED_RESPONSE_REASONS.has(reason) ? { body: reason } : {}),
    };
  }
  // What axios makes of a JSON body.
  if (Array.isArray(data)) return { bodyKind: "json" };
  if (Object.getPrototypeOf(data) === Object.prototype) {
    return {
      bodyKind: "json",
      bodyKeys: Object.keys(data as object)
        .filter((key) => FIELD_NAME.test(key))
        .slice(0, MAX_RESPONSE_BODY_KEYS),
    };
  }
  return { bodyKind: "other" };
};

// The product a Server header opens with: "Kestrel", "nginx/1.25.3",
// "Microsoft-IIS/10.0", the "Apache/2.4.57" of "Apache/2.4.57 (Debian)".
// The header is free text and an admin can put the host name in it, so the
// name has to end where a product token does: at the end of the value, a
// space, a slash, a comment or a list separator. A dot or a colon after it
// makes it a host ("my-host.duckdns.org", "nas:8096") and nothing matches;
// neither does a name longer than any product's, as a cut of one would still
// be a cut of something unknown.
//
// The version is kept when it is one to three numbers and left off, with the
// name still given, when it is anything else: four numbers are an IPv4
// address as much as a version, and whatever else follows a slash is as free
// as the rest. Numbers that run into a colon or another slash were the start
// of an address, a port or a path ("proxy/2001:db8::5", "proxy/192.168.1/24")
// and are left off as well, where a suffix is not ("nginx/1.25.3-alpine").
const SERVER_PRODUCT =
  /^([A-Za-z][A-Za-z0-9_-]{0,31})(?=$|[\s/(,;])(?:\/(\d{1,5}(?:\.\d{1,5}){0,2})(?![.\d:/]))?/;

// What stands in for a header that was sent and is not repeated, in the
// brackets utils/sentry's scrubber marks its own cuts with. That a header was
// there is half of what it had to say: Kestrel always names itself, so a
// Server header that is anything else is a proxy's, and one that is missing
// is a proxy that strips it. Leaving both out made the two read the same.
const WITHHELD_HEADER = "[withheld]";

// A header as text. axios hands over a string, or a list of them when the
// header came more than once, which reads as its entries with commas between.
const headerText = (header: unknown): string =>
  header ? String(header).trim() : "";

const describeServer = (header: unknown): string | undefined => {
  const value = headerText(header);
  if (!value) return undefined;
  const match = SERVER_PRODUCT.exec(value);
  if (!match) return WITHHELD_HEADER;
  const [, name, version] = match;
  return version ? `${name}/${version}` : name;
};

// A media type whose two halves are plain words: "text/plain",
// "application/problem+json". No dots, which leaves the vendor types out
// ("application/vnd.api+json") along with any host written where a subtype
// goes; no server the app talks to answers with one.
const MEDIA_TYPE =
  /^([a-z0-9][a-z0-9_+-]{0,31})\/([a-z0-9][a-z0-9_+-]{0,63})(?=$|[\s;,])/i;

// The charset parameter, quoted or not. This finds the text "charset="
// wherever it stands, inside another parameter's quoted value included, so
// what it finds is only repeated when it is one of KNOWN_CHARSETS.
const CHARSET_PARAMETER =
  /;\s*charset\s*=\s*"?([a-z0-9][a-z0-9_-]{0,23})"?\s*(?=$|;)/i;

// The charsets a server or a proxy labels an error with. A charset is a
// closed set of names, unlike a product, so any other word in its place is
// free text and is left off.
const KNOWN_CHARSETS: ReadonlySet<string> = new Set([
  "utf-8",
  "utf8",
  "utf-16",
  "us-ascii",
  "iso-8859-1",
  "windows-1252",
]);

// Every other parameter is dropped: a boundary or a profile is free text.
const describeContentType = (header: unknown): string | undefined => {
  const value = headerText(header);
  if (!value) return undefined;
  const mediaType = MEDIA_TYPE.exec(value);
  if (!mediaType) return WITHHELD_HEADER;
  const charset = CHARSET_PARAMETER.exec(
    value.slice(mediaType[0].length),
  )?.[1].toLowerCase();
  return `${mediaType[1]}/${mediaType[2]}${
    charset && KNOWN_CHARSETS.has(charset) ? `; charset=${charset}` : ""
  }`.toLowerCase();
};

/**
 * What the server said about a rejected request, enough to tell who answered:
 * Jellyfin answers with `Server: Kestrel` and a text/plain reason or ASP.NET
 * problem details, Seerr with a JSON message, a proxy with its own Server
 * header and an HTML page.
 *
 * This goes to Sentry as context, so the body is described and not quoted.
 * A body is text written by a machine the app knows nothing about: a proxy
 * names the host it could not reach, a gateway its zone, a server the path or
 * the name it did not find. utils/sentry's scrubDeep only knows a host by its
 * scheme or as an IPv4 address, and nothing knows a title or a user name, so
 * no cut of that text is safe to send. What is sent instead is the kind of
 * body, its length, the field names of a JSON object, and the text itself
 * only when it is one of FIXED_RESPONSE_REASONS. An HTML page counts as one
 * under any content type, since a proxy does not always label its page.
 *
 * The two headers are text from the same machine and are cut down the same
 * way: the Server header to the product it names, the content type to the
 * media type and its charset. One that was sent and names neither is given
 * as WITHHELD_HEADER, so that it still tells from one that was not sent.
 */
export const describeHttpResponse = (
  error: unknown,
): HttpResponseDescription | undefined => {
  if (!isAxiosError(error) || !error.response) return undefined;
  const headers = error.response.headers ?? {};
  const contentType = headers["content-type"];
  return {
    status: error.response.status,
    contentType: describeContentType(contentType),
    server: describeServer(headers.server),
    // Read against the content type as it came, not the cut of it.
    ...describeResponseBody(error.response.data, String(contentType ?? "")),
  };
};
