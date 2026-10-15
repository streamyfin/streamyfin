/**
 * What the plugin holds for this device once a registration lands, as a key: the
 * registration posts a key once, and again only when it changes. The plugin keeps
 * one row per device and updates it in place, so posting once per server, user,
 * token, language and poster address is enough; the registration runs again
 * whenever the api or the user object changes identity, which on sign in is twice
 * within a second, and the plugin answered the second post with a 500 on its device
 * id.
 *
 * The language and the poster's address are part of the key rather than of what
 * makes a session: the plugin writes each notification in the language of the device
 * it goes to and fetches its poster from that address, so a change to either has to
 * reach it, and not having a language yet is not a reason to wait.
 *
 * A missing server, user or token means there is no session to register with, which
 * is what sign out looks like: there is no key, and the registration forgets the one
 * it sent, so signing in again on the same server, as the same user, with the same
 * token, posts again. Sign out deleted the device.
 */
export const pushRegistrationKey = (
  serverUrl: string | null | undefined,
  userId: string | undefined,
  token: string | undefined,
  language?: string | undefined,
  posterServerUrl?: string | undefined,
): string | null =>
  serverUrl && userId && token
    ? `${serverUrl}|${userId}|${token}|${language ?? ""}|${posterServerUrl ?? ""}`
    : null;

// Every write of this device's registration on the plugin, the posts and the sign
// out's delete, runs once the one before it settles. A post still in flight could
// otherwise land after the delete and bring back the row of a signed out device,
// which nothing removes afterwards.
let pending: Promise<unknown> = Promise.resolve();

export const inRegistrationOrder = <T>(write: () => Promise<T>): Promise<T> => {
  const next = pending.then(write, write);
  pending = next.catch(() => undefined);
  return next;
};
