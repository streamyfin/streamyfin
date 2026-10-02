/**
 * What the push token registration does on one run of its effect, given what it
 * posted last time. The plugin keeps one row per device and updates it in place, so
 * posting once per server, user and token is enough; the effect runs again whenever
 * the api or the user object changes identity, which on sign in is twice within a
 * second, and the plugin answered the second post with a 500 on its device id.
 *
 * The language is part of the key rather than of what makes a session: the plugin
 * writes each notification in the language of the device it goes to, so changing the
 * app's language has to reach it, and not having one yet is not a reason to wait.
 *
 * A missing part means there is no session to register with, which is what sign out
 * looks like: the key is forgotten, so signing in again on the same server, as the
 * same user, with the same token, posts again. Sign out deleted the device.
 */
export const pushRegistrationKey = (
  serverUrl: string | undefined,
  userId: string | undefined,
  token: string | undefined,
  language?: string | undefined,
): string | null =>
  serverUrl && userId && token
    ? `${serverUrl}|${userId}|${token}|${language ?? ""}`
    : null;

export const pushRegistrationStep = (
  last: string | null,
  serverUrl: string | undefined,
  userId: string | undefined,
  token: string | undefined,
  language?: string | undefined,
): { key: string | null; post: boolean } => {
  const key = pushRegistrationKey(serverUrl, userId, token, language);
  return { key, post: key !== null && key !== last };
};
