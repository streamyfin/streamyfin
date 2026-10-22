/**
 * How long a Quick Connect code stays valid. Jellyfin drops a request ten
 * minutes after it was made (`Timeout` in QuickConnectManager), so the TV
 * offers a new code then instead of showing one nobody can approve.
 */
export const QUICK_CONNECT_CODE_LIFETIME_MS = 10 * 60 * 1000;
