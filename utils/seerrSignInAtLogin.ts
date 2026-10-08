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

/**
 * Hands a session to the app while the account it was opened for is still the
 * one signed in, and drops it otherwise. Every sign-in stores its session as
 * it opens, before the account can be checked again, and a sign-out or a
 * switch meanwhile would leave the previous account's session to the next.
 * True if handed over.
 */
export const handOverSeerrSession = (
  user: SeerrUser,
  {
    stillCurrent,
    forget,
    signedIn,
  }: Pick<SeerrSignInAtLogin, "stillCurrent" | "forget" | "signedIn">,
): boolean => {
  if (!stillCurrent()) {
    forget();
    return false;
  }
  signedIn(user);
  return true;
};

export const signInToSeerrAtLogin = async (
  steps: SeerrSignInAtLogin,
): Promise<void> => {
  try {
    // Quick Connect before the password: a Seerr that can open a session from
    // the Jellyfin token means there is no reason to keep the user's password
    // on the device at all.
    const quickConnected = await steps.quickConnect();
    if (quickConnected) {
      handOverSeerrSession(quickConnected, steps);
      return;
    }

    // Nor for an account that has since been left: the password is the
    // previous user's, and would be stored under their id.
    if (!steps.stillCurrent()) return;
    const result = await steps.test();
    if (!result.isValid || !result.requiresPass) return;

    // Checked before the call too, so an account that has left opens no
    // session at all.
    if (!steps.stillCurrent()) return;
    if (handOverSeerrSession(await steps.login(), steps)) {
      steps.rememberPassword();
    }
  } catch (e) {
    writeErrorLog(
      `Seerr sign-in at login failed: ${e instanceof Error ? e.message : e}`,
    );
  }
};

/**
 * The passwordless sign-in JellyfinProvider runs for an account whose plugin
 * gives Seerr's admin API key: Quick Connect when a session api is there, the
 * key otherwise.
 */
export interface SeerrApiKeySignIn {
  /** Quick Connect, which needs no key. Undefined when it could not. */
  quickConnect: () => Promise<SeerrUser | undefined>;
  /** Resolves the account through the admin key, and stores the session. */
  loginWithApiKey: () => Promise<SeerrUser>;
  /** Drops the stored Seerr session, cookies included. */
  forget: () => void;
  /** Whether the account this started for is still the one signed in. */
  stillCurrent: () => boolean;
  /** Hands the session to the app. */
  signedIn: (user: SeerrUser) => void;
}

export const signInToSeerrWithApiKey = async (
  steps: SeerrApiKeySignIn,
): Promise<void> => {
  try {
    const quickConnected = await steps.quickConnect();
    if (quickConnected) {
      handOverSeerrSession(quickConnected, steps);
      return;
    }

    // The key is not replayed for an account that has since been left:
    // resolved for the previous user, it would sign the next one in as them.
    if (!steps.stillCurrent()) return;
    handOverSeerrSession(await steps.loginWithApiKey(), steps);
  } catch (e) {
    writeErrorLog(
      `Seerr API-key sign-in failed: ${e instanceof Error ? e.message : e}`,
    );
  }
};
