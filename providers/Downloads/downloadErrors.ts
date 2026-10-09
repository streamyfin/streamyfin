import { isGatewayStatus } from "@/utils/errors";

/**
 * What to do with a native download error:
 * - "environment": where the user is, their storage, or their server's proxy.
 *   Kept in the local log only.
 * - "report": anything else, with the `detail` to report it under.
 */
export type DownloadErrorClass =
  | { kind: "environment" }
  | { kind: "report"; detail: string };

// Native error payloads are plain strings, so user-environment failures are
// told by keyword: connectivity (walking out of Wi-Fi range is the normal
// downloads scenario), a full disk, and a TLS connection that broke under the
// transfer ("Read error: ssl=…: Failure in SSL library, usually a protocol
// error" is Android's wording for a connection cut mid-read; a certificate
// the device does not trust is the server's setup either way).
//
// A transfer cut on the way carries none of those words: "stream was reset:
// INTERNAL_ERROR" (Android, the peer or a proxy resetting the HTTP/2 stream),
// "unexpected end of stream" (Android, the connection closed before the body
// ended) and "cannot parse response" (iOS, an answer cut short or mangled).
//
// iOS hands over its errors in the user's language ("impossibile analizzare
// la risposta"), which no list of words covers: only the English wording is
// known here.
const ENVIRONMENT_PATTERN =
  /connect|network|internet|offline|time.?out|timed out|unreachable|resolve|dns|route|no space|enospc|disk full|not enough (?:free )?space|insufficient storage|\bssl\b|\btls\b|handshake|certificate|stream was reset|unexpected end of stream|cannot parse response/i;

// The status the server refused the download with: "HTTP error: 500 Internal
// Server Error" on Android, "HTTP error: 500" and "Server responded with HTTP
// 500" on iOS.
const HTTP_STATUS_PATTERN = /\bHTTP(?: error:)? (\d{3})\b/i;

/**
 * Sorts a native download error the way the same failure is sorted when it
 * comes from axios: a download refused with a status is a request like any
 * other. A gateway status is the server being unreachable, and a 401 is a
 * session that ended (the app never reports those); every other status is
 * reported, as the status alone: the reason phrase after it differs from one
 * server and one HTTP version to the next, and each wording would otherwise
 * be an issue of its own.
 */
export const classifyDownloadError = (error: string): DownloadErrorClass => {
  const status = Number(HTTP_STATUS_PATTERN.exec(error)?.[1]);
  if (status) {
    if (status === 401 || isGatewayStatus(status)) {
      return { kind: "environment" };
    }
    return { kind: "report", detail: `HTTP error: ${status}` };
  }
  if (ENVIRONMENT_PATTERN.test(error)) return { kind: "environment" };
  return { kind: "report", detail: error };
};
