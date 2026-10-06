import { markExpectedError } from "@/utils/errors";

/**
 * What a resolver answers when a value behind the headers could not be read:
 * iOS launched the app in the background on a locked phone, and the Keychain
 * hands nothing out until it is unlocked.
 *
 * It is empty, so anything that renders with it attaches nothing. All of the
 * headers are withheld even when only one value failed: half of a gateway's
 * credentials open nothing.
 */
export const UNREADABLE_HEADERS: Record<string, string> = Object.freeze({});

/**
 * Whether `headers` stand for values that could not be read, rather than for
 * a service with no headers configured.
 *
 * A client that takes a refusal as the end of the session has to ask before
 * it sends anything: without its headers a request is turned away by the
 * user's gateway, not by the server behind it. It only holds for the object a
 * resolver returned, not for a copy of it.
 */
export function headersUnreadable(headers: Record<string, string>): boolean {
  return headers === UNREADABLE_HEADERS;
}

/**
 * What such a client fails a request with instead of sending it. It carries
 * no response, so nothing reads it as the server's answer, and it is the
 * phone doing what it does, so it is marked to stay out of Sentry.
 */
export function unreadableHeadersError(): Error {
  return markExpectedError(
    new Error("Custom headers are unreadable, request not sent"),
  );
}
