/**
 * The key under which a push token was last posted to the Streamyfin plugin: one
 * server, one user, one token. The effect that posts it runs again whenever the api
 * or the user object changes identity, which on sign in is twice within a second, and
 * the plugin answered the second post with a 500 on its device id. Posting once per
 * key is enough: the plugin keeps one row per device and updates it in place.
 */
export const pushRegistrationKey = (
  serverUrl: string | undefined,
  userId: string | undefined,
  token: string | undefined,
): string | null =>
  serverUrl && userId && token ? `${serverUrl}|${userId}|${token}` : null;
