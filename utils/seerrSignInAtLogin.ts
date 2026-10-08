import { atom } from "jotai";
import type { TestResult } from "@/hooks/useSeerr";
import { writeErrorLog } from "@/utils/log";
import type { User as SeerrUser } from "@/utils/seerr/types";
import { store } from "@/utils/store";

// How many password sign-ins are signing each user in to Seerr, only users
// with one listed. SeerrAutoLogin waits while the signed-in user is listed:
// the plugin's Seerr address reaches it with that sign-in's refresh, and both
// would otherwise run Quick Connect for the same user and race to open the
// session.
export const seerrSignInsAtLoginAtom = atom<ReadonlyMap<string, number>>(
  new Map(),
);

// Counted rather than marked: two sign-ins for the same user can overlap and
// end in any order, and the hold lasts until the last one ends. A sign-in
// without a user holds nothing, and ending twice counts once.
export const holdSeerrSignIn = (
  userId: string | null | undefined,
): (() => void) => {
  if (!userId) return () => {};
  const count = (by: number) => {
    const held = new Map(store.get(seerrSignInsAtLoginAtom));
    const left = (held.get(userId) ?? 0) + by;
    if (left > 0) held.set(userId, left);
    else held.delete(userId);
    store.set(seerrSignInsAtLoginAtom, held);
  };
  count(1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    count(-1);
  };
};

/**
 * Signing in to Seerr once a sign-in with the Jellyfin password succeeded.
 *
 * The login does not wait for it: a Seerr out of reach holds each request for
 * the platform's timeout, and the user is on the home screen by then.
 */
export interface SeerrSignInAtLogin {
  /** Quick Connect, which needs no password. Undefined when it could not. */
  quickConnect: () => Promise<SeerrUser | undefined>;
  /** Whether Seerr answers, and wants the Jellyfin password. */
  test: () => Promise<TestResult>;
  /** Opens a session with the password, and stores it. */
  login: () => Promise<SeerrUser>;
  /** Drops the stored Seerr session, cookies included. */
  forget: () => void;
  /** Whether the account this started for is still the one signed in. */
  stillCurrent: () => boolean;
  /** Hands the session to the app. */
  signedIn: (user: SeerrUser) => void;
  /** Keeps the password for later launches, once it has proven to work. */
  rememberPassword: () => void;
}

export const signInToSeerrAtLogin = async (
  steps: SeerrSignInAtLogin,
): Promise<void> => {
  try {
    // Quick Connect before the password: a Seerr that can open a session from
    // the Jellyfin token means there is no reason to keep the user's password
    // on the device at all.
    const quickConnected = await steps.quickConnect();
    if (quickConnected) {
      // Checked again, as after the password: Quick Connect checks the account
      // before it stores the session, and the account can still move on
      // before the session is handed over.
      if (!steps.stillCurrent()) {
        steps.forget();
        return;
      }
      steps.signedIn(quickConnected);
      return;
    }

    // Nor for an account that has since been left: the password is the
    // previous user's, and would be stored under their id.
    if (!steps.stillCurrent()) return;
    const result = await steps.test();
    if (!result.isValid || !result.requiresPass) return;

    // Checked on both sides of the call, as Quick Connect does: before, so an
    // account that has left opens no session, and after, because login stores
    // the session it opens before anyone can look.
    if (!steps.stillCurrent()) return;
    const user = await steps.login();
    if (!steps.stillCurrent()) {
      steps.forget();
      return;
    }
    steps.signedIn(user);
    steps.rememberPassword();
  } catch (e) {
    writeErrorLog(
      `Seerr sign-in at login failed: ${e instanceof Error ? e.message : e}`,
    );
  }
};
