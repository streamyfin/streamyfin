/**
 * How long a Quick Connect code stays valid. Jellyfin drops a request ten
 * minutes after it was made (`Timeout` in QuickConnectManager), so the TV
 * offers a new code then instead of showing one nobody can approve.
 */
export const QUICK_CONNECT_CODE_LIFETIME_MS = 10 * 60 * 1000;

/** Wait between settled Quick Connect requests, so slow responses never overlap. */
export const QUICK_CONNECT_POLL_INTERVAL_MS = 1000;

/**
 * Wait after the browser closed before the login screen opens it again. iOS
 * reports the close while the browser is still animating away, when a new one
 * would never show, and Android, whose timers pause in the background, needs
 * a poll to see an approval before reopening for nothing.
 */
export const QUICK_CONNECT_BROWSER_REOPEN_DELAY_MS = 1500;

/**
 * How long one Quick Connect request may take. React Native's Android client
 * waits forever by default, and the polling waits for each answer, so a
 * request that never settles would stop it for good.
 */
export const QUICK_CONNECT_REQUEST_TIMEOUT_MS = 15 * 1000;
